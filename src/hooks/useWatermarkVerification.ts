"use client";

import {useEffect, useRef, useState} from "react";
import {
  decodeNumericUserIdDiagnosticsFromLuma,
  decodeAndVerifyFrameFromLuma,
  fetchPublicKeyPem,
  importPublicKeyFromPem,
} from "@/lib/watermark-verification";
import {
  disposeWasmVerificationSession,
  ensureWasmVerificationSession,
  getFrameYFromWasm,
  getFrameYuvFromWasm,
  getWasmVideoTrackInfo,
  prewarmWasmVerificationSession,
  scheduleDisposeWasmVerificationSession,
  type WasmKeyframe,
} from "@/lib/wasm-watermark-verification-client";
import {isV3Reading, readFrameV3, verifyV3Signature, type V3FrameReading} from "@/lib/watermark-v3";

export type WatermarkVerificationStatus = "idle" | "verifying" | "verified" | "failed";
/** Detected per video at bootstrap: a valid U/V user-ID block means v3, otherwise v2. */
export type WatermarkFormat = "v2" | "v3";
type KeyframeCheckResult = "verified" | "failed" | "error";

/** A keyframe the playhead has reached must be verified within this much wall-clock *playing* time. */
export const KEYFRAME_VERIFY_DEADLINE_MS = 6000;
/** The queue verifies keyframes up to this far (media seconds) ahead of the playhead. */
export const KEYFRAME_VERIFY_LOOKAHEAD_S = 4;
const KEYFRAME_TIME_EPSILON_S = 0.05;
const QUEUE_IDLE_POLL_MS = 200;
const DEADLINE_TICK_MS = 250;
export type VerificationProgressPhase =
  | "prewarm"
  | "session_init"
  | "moov_parse"
  | "ffmpeg_load"
  | "frame_decode"
  | "key_fetch"
  | "rsa_verify"
  | "finalizing";
export type VerificationProgress = {
  phase: VerificationProgressPhase;
  detail?: string;
  ts: number;
};

type UseWatermarkVerificationOptions = {
  /** When true, run verification when the video has frame 0 available. */
  enabled: boolean;
  /** Callback when verification completes (success or failure). */
  onVerificationComplete?: (status: "verified" | "failed", userId: string | null) => void;
  onVerificationProgress?: (progress: VerificationProgress) => void;
};

const SESSION_KEEPALIVE_TTL_MS = 45000;
/** Decode-only budgets (session init is awaited separately so iOS moov/ffmpeg load does not consume these). */
const FRAME0_DECODE_TIMEOUT_MS = 25000;
const FOLLOWUP_FRAME_DECODE_TIMEOUT_MS = 12000;
const FRAME0_DECODE_TIMEOUT_4K_MS = 60000;
const FOLLOWUP_DECODE_TIMEOUT_4K_MS = 25000;
/** Whole bootstrap including init, decodes, key fetch — must exceed worst-case cold 4K on Mobile Safari. */
const BOOTSTRAP_TIMEOUT_MS = 180000;

/**
 * Bootstrap decodes user ID from frames 0/1/2 (no key) via Web Worker + ffmpeg.wasm (demux → decode → Y plane).
 * Canvas/WebCodecs are not used for verification; fails if the WASM worker cannot decode.
 */
export function useWatermarkVerification(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  videoUrl: string | null,
  options: UseWatermarkVerificationOptions
) {
  const {enabled, onVerificationComplete, onVerificationProgress} = options;
  const [status, setStatus] = useState<WatermarkVerificationStatus>("idle");
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const publicKeyRef = useRef<CryptoKey | null>(null);
  const callbackFiredRef = useRef(false);
  const verifiedFrameIndicesRef = useRef<Set<number>>(new Set());
  const onVerificationCompleteRef = useRef<typeof onVerificationComplete>(onVerificationComplete);
  const verificationSessionKeyRef = useRef<string | null>(null);
  const verificationStartedRef = useRef(false);
  const inconclusiveGraceUsedRef = useRef(false);
  const prewarmStartedRef = useRef(false);
  const onVerificationProgressRef = useRef<typeof onVerificationProgress>(onVerificationProgress);
  const lastProgressRef = useRef<{phase: VerificationProgressPhase; detail?: string} | null>(null);
  /** True only for the synchronous stretch after we call `video.pause()` from verification failure paths. */
  const programmaticPauseForDiagRef = useRef(false);
  const [watermarkFormat, setWatermarkFormat] = useState<WatermarkFormat | null>(null);
  const watermarkFormatRef = useRef<WatermarkFormat | null>(null);
  /** User id decoded at bootstrap; every later keyframe must carry the same one. */
  const bootstrapUserIdRef = useRef<number | null>(null);
  /** Refetch of the public key before blocking on a signature mismatch is allowed once per video. */
  const keyRefreshUsedRef = useRef(false);
  /** Per-keyframe decode budget (larger for 4K), set at bootstrap. */
  const followupDecodeTimeoutRef = useRef(FOLLOWUP_FRAME_DECODE_TIMEOUT_MS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debugLog = (...args: any[]) => {
    console.log("[WatermarkVerify]", ...args);
  };

  useEffect(() => {
    onVerificationCompleteRef.current = onVerificationComplete;
  }, [onVerificationComplete]);
  useEffect(() => {
    onVerificationProgressRef.current = onVerificationProgress;
  }, [onVerificationProgress]);

  const emitProgress = (phase: VerificationProgressPhase, detail?: string) => {
    if (
      lastProgressRef.current &&
      lastProgressRef.current.phase === phase &&
      lastProgressRef.current.detail === detail
    ) {
      return;
    }
    lastProgressRef.current = {phase, detail};
    onVerificationProgressRef.current?.({phase, detail, ts: Date.now()});
  };

  useEffect(() => {
    if (!enabled || !videoUrl) return;
    if (prewarmStartedRef.current && verificationSessionKeyRef.current === videoUrl) return;
    prewarmStartedRef.current = true;
    verificationSessionKeyRef.current = videoUrl;
    const t0 = performance.now();
    emitProgress("prewarm", "Warming verification engine");
    void prewarmWasmVerificationSession(videoUrl).finally(() => {
      console.log("[Frame0Decode] Prewarm complete", {
        prewarmMs: Math.round(performance.now() - t0),
      });
    });
  }, [enabled, videoUrl]);

  // Frame 0: decode user ID (no key) → fetch public key → RSA verify frame 0. WebCodecs only.
  // Run verification immediately when enabled; do not wait for the video element (captureFrame0YFromUrl does its own Range fetch).
  useEffect(() => {
    debugLog("Effect start", {enabled, hasVideoUrl: !!videoUrl});
    if (!videoUrl) {
      setStatus("idle");
      setVerifiedUserId(null);
      callbackFiredRef.current = false;
      verificationStartedRef.current = false;
      verificationSessionKeyRef.current = null;
      publicKeyRef.current = null;
      inconclusiveGraceUsedRef.current = false;
      prewarmStartedRef.current = false;
      verifiedFrameIndicesRef.current = new Set();
      lastProgressRef.current = null;
      watermarkFormatRef.current = null;
      setWatermarkFormat(null);
      bootstrapUserIdRef.current = null;
      keyRefreshUsedRef.current = false;
      scheduleDisposeWasmVerificationSession(SESSION_KEEPALIVE_TTL_MS);
      return;
    }
    if (!enabled) {
      // Keep warmed session alive while player remains open and URL is stable.
      return;
    }

    const sessionKey = videoUrl;
    if (verificationSessionKeyRef.current !== sessionKey) {
      verificationSessionKeyRef.current = sessionKey;
      verificationStartedRef.current = false;
      callbackFiredRef.current = false;
      inconclusiveGraceUsedRef.current = false;
      verifiedFrameIndicesRef.current = new Set();
      watermarkFormatRef.current = null;
      setWatermarkFormat(null);
      bootstrapUserIdRef.current = null;
      keyRefreshUsedRef.current = false;
    }
    if (verificationStartedRef.current) {
      debugLog("Skipping duplicate bootstrap verification in same session", {sessionKey});
      return;
    }
    verificationStartedRef.current = true;

    const verifyStartTime = performance.now();
    console.log("[Frame0Decode] Verification starting immediately (no video element wait)", {
      t: Math.round(verifyStartTime),
    });

    setStatus("verifying");
    let mounted = true;

    const runVerification = async () => {
      const initStart = performance.now();
      emitProgress("session_init", "Preparing secure verification");
      emitProgress("moov_parse", "Reading video structure");
      emitProgress("ffmpeg_load", "Loading verification engine");
      let sessionMeta: Awaited<ReturnType<typeof ensureWasmVerificationSession>> = null;
      try {
        sessionMeta = await ensureWasmVerificationSession(videoUrl);
      } catch (e) {
        debugLog("WASM session init failed", e);
        if (!mounted) return;
        setStatus("failed");
        if (!callbackFiredRef.current && onVerificationCompleteRef.current) {
          callbackFiredRef.current = true;
          onVerificationCompleteRef.current("failed", null);
        }
        return;
      }
      if (!mounted) return;
      if (!sessionMeta) {
        if (mounted) setStatus("failed");
        if (mounted && !callbackFiredRef.current && onVerificationCompleteRef.current) {
          callbackFiredRef.current = true;
          onVerificationCompleteRef.current("failed", null);
        }
        return;
      }

      const maxDim = Math.max(sessionMeta.width, sessionMeta.height);
      const is4K = maxDim >= 2160;
      const frame0DecodeTimeoutMs = is4K ? FRAME0_DECODE_TIMEOUT_4K_MS : FRAME0_DECODE_TIMEOUT_MS;
      const followupDecodeTimeoutMs = is4K
        ? FOLLOWUP_DECODE_TIMEOUT_4K_MS
        : FOLLOWUP_FRAME_DECODE_TIMEOUT_MS;
      followupDecodeTimeoutRef.current = followupDecodeTimeoutMs;

      console.log("[Frame0Decode] Session ready (init complete)", {
        initMs: Math.round(performance.now() - initStart),
        width: sessionMeta.width,
        height: sessionMeta.height,
        frame0DecodeTimeoutMs,
        followupDecodeTimeoutMs,
      });

      const decodeStart = performance.now();
      const frameIndexes = [0, 1, 2];
      const candidates: Array<{
        frameIndex: number;
        numericUserId: number;
        bestScore: number;
        repsUsed: number;
        yPlane: Uint8Array;
        width: number;
        height: number;
      }> = [];
      let strongFrame0Candidate: (typeof candidates)[number] | null = null;
      let v3Bootstrap: {frameIndex: number; reading: V3FrameReading & {userIdUv: number}} | null = null;

      for (const frameIndex of frameIndexes) {
        emitProgress("frame_decode", `Checking watermark on frame ${frameIndex}`);
        const frameStart = performance.now();
        const frameDecodeTimeoutMs =
          frameIndex === 0 ? frame0DecodeTimeoutMs : followupDecodeTimeoutMs;
        let webCodecsY: {yPlane: Uint8Array; width: number; height: number} | null = null;
        let v3Reading: V3FrameReading | null = null;
        try {
          // Y, U and V: the U/V user-ID block tells v3 from v2; v2 uses only the Y plane below.
          const yuv = await Promise.race([
            getFrameYuvFromWasm(videoUrl, frameIndex),
            new Promise<null>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Frame decode timeout (${frameDecodeTimeoutMs}ms)`)),
                frameDecodeTimeoutMs
              )
            ),
          ]);
          if (yuv) {
            webCodecsY = {yPlane: yuv.y, width: yuv.width, height: yuv.height};
            v3Reading = readFrameV3(yuv);
          }
        } catch (e) {
          debugLog("WASM frame capture failed", {frameIndex, error: e});
          // If ffmpeg/worker gets stuck on iOS Safari, force a reset so subsequent frames can proceed.
          if (e instanceof Error && e.message.includes("timeout")) {
            await disposeWasmVerificationSession();
          }
        }
        if (!mounted) return;
        if (!webCodecsY) {
          console.log("[Frame0Decode] Bootstrap frame decode result", {
            frameIndex,
            elapsedMs: Math.round(performance.now() - frameStart),
            captured: false,
          });
          continue;
        }

        if (isV3Reading(v3Reading)) {
          console.log("[Frame0Decode] Bootstrap v3 frame", {
            frameIndex,
            elapsedMs: Math.round(performance.now() - frameStart),
            userIdUv: v3Reading.userIdUv,
            userIdY: v3Reading.userIdY,
            signatureReadable: v3Reading.signature !== null,
          });
          v3Bootstrap = {frameIndex, reading: v3Reading};
          break;
        }

        const diagnostics = decodeNumericUserIdDiagnosticsFromLuma(
          webCodecsY.yPlane,
          webCodecsY.width,
          webCodecsY.height
        );
        console.log("[Frame0Decode] Bootstrap frame decode result", {
          frameIndex,
          elapsedMs: Math.round(performance.now() - frameStart),
          numericUserId: diagnostics.numericUserId,
          bestScore: diagnostics.bestScore,
          repsUsed: diagnostics.repsUsed,
          validDigits: diagnostics.validDigits,
          rightSideLength: diagnostics.rightSideLength,
        });

        if (
          diagnostics.numericUserId !== null &&
          diagnostics.numericUserId > 0 &&
          diagnostics.validDigits
        ) {
          const candidate = {
            frameIndex,
            numericUserId: diagnostics.numericUserId,
            bestScore: diagnostics.bestScore,
            repsUsed: diagnostics.repsUsed,
            yPlane: webCodecsY.yPlane,
            width: webCodecsY.width,
            height: webCodecsY.height,
          };
          candidates.push(candidate);
          if (frameIndex === 0 && diagnostics.bestScore === 0 && diagnostics.repsUsed >= 4) {
            strongFrame0Candidate = candidate;
            console.log("[Frame0Decode] Strong frame0 candidate short-circuit", {
              frameIndex,
              numericUserId: diagnostics.numericUserId,
              bestScore: diagnostics.bestScore,
              repsUsed: diagnostics.repsUsed,
            });
            break;
          }
        }
      }

      if (v3Bootstrap) {
        await finishV3Bootstrap(v3Bootstrap.frameIndex, v3Bootstrap.reading, decodeStart, sessionMeta.nbSamples);
        return;
      }

      const votes = new Map<number, number>();
      for (const candidate of candidates) {
        votes.set(candidate.numericUserId, (votes.get(candidate.numericUserId) ?? 0) + 1);
      }
      let selected: (typeof candidates)[number] | null = null;
      let maxVotes = 0;
      for (const candidate of candidates) {
        const voteCount = votes.get(candidate.numericUserId) ?? 0;
        if (
          !selected ||
          voteCount > maxVotes ||
          (voteCount === maxVotes && candidate.bestScore < selected.bestScore)
        ) {
          selected = candidate;
          maxVotes = voteCount;
        }
      }

      const passesConsensus =
        !!selected &&
        (maxVotes >= 2 || (maxVotes === 1 && selected.bestScore === 0 && selected.repsUsed >= 4));
      const shouldShortCircuit = !!strongFrame0Candidate;
      if (shouldShortCircuit) {
        selected = strongFrame0Candidate;
      }

      console.log("[Frame0Decode] Bootstrap consensus summary", {
        candidates: candidates.map((c) => ({
          frameIndex: c.frameIndex,
          numericUserId: c.numericUserId,
          bestScore: c.bestScore,
          repsUsed: c.repsUsed,
          votes: votes.get(c.numericUserId) ?? 0,
        })),
        selectedNumericUserId: selected?.numericUserId ?? null,
        selectedFrameIndex: selected?.frameIndex ?? null,
        selectedVotes: selected ? votes.get(selected.numericUserId) ?? 0 : 0,
        pass: shouldShortCircuit ? true : passesConsensus,
        shortCircuitedOnFrame0: shouldShortCircuit,
      });

      if ((!passesConsensus && !shouldShortCircuit) || !selected) {
        debugLog("Bootstrap consensus failed: WASM verification path only", {
          candidateCount: candidates.length,
        });
        console.log(
          "[WatermarkVerify] Bootstrap decode failed. Ensure WASM worker/ffmpeg can load (see [WatermarkVerify] logs). Video URL snippet:",
          videoUrl?.slice(-80)
        );
        console.log("[Frame0Decode] Verification finished", { status: "failed", elapsedMs: Math.round(performance.now() - verifyStartTime) });
        if (mounted) setStatus("failed");
        if (mounted && !callbackFiredRef.current && onVerificationCompleteRef.current) {
          callbackFiredRef.current = true;
          onVerificationCompleteRef.current("failed", null);
        }
        return;
      }

      const numericUserId = selected.numericUserId;
      console.log("[Frame0Decode] Decode phase timing", {
        frameDecodeMs: Math.round(performance.now() - decodeStart),
      });
      const keyFetchStart = performance.now();
      emitProgress("key_fetch", "Retrieving signer key");
      let pem: string | null = null;
      try {
        debugLog("Fetching public key PEM", {numericUserId});
        pem = await fetchPublicKeyPem(numericUserId);
        debugLog("Fetched public key PEM length", {length: pem.length});
      } catch (e) {
        debugLog("Fetch public key failed (non-blocking)", e);
      }
      console.log("[Frame0Decode] Key fetch timing", {
        keyFetchMs: Math.round(performance.now() - keyFetchStart),
      });

      let key: CryptoKey | null = null;
      if (pem) {
        try {
          key = await importPublicKeyFromPem(pem);
          debugLog("Imported public key");
        } catch (e) {
          debugLog("Import key failed (non-blocking)", e);
        }
      }
      publicKeyRef.current = key;

      if (key) {
        emitProgress("rsa_verify", "Validating authenticity signature");
        try {
          const result = await decodeAndVerifyFrameFromLuma(
            key,
            selected.yPlane,
            selected.width,
            selected.height
          );
          debugLog("Bootstrap RSA verification result (WASM Y plane)", {
            verified: result.verified,
            numericUserId: result.numericUserId,
            frameIndex: selected.frameIndex,
          });
        } catch (e) {
          debugLog("RSA verification threw (non-blocking)", e);
        }
      }

      if (!mounted) return;
      emitProgress("finalizing", "Final checks");
      const elapsed = Math.round(performance.now() - verifyStartTime);
      console.log("[Frame0Decode] Verification finished", { status: "verified", elapsedMs: elapsed });
      console.log("[Frame0Decode] Full video loads only after this (when <video> src is set). Verification used Range requests + WASM decode.");
      verifiedFrameIndicesRef.current = new Set([0]);
      watermarkFormatRef.current = "v2";
      setWatermarkFormat("v2");
      bootstrapUserIdRef.current = numericUserId;
      setVerifiedUserId(String(numericUserId));
      setStatus("verified");
      debugLog("Verification succeeded for frame 0 (user ID decoded)", {numericUserId, format: "v2"});
      if (!callbackFiredRef.current && onVerificationCompleteRef.current) {
        callbackFiredRef.current = true;
        onVerificationCompleteRef.current("verified", String(numericUserId));
      }
    };

    /**
     * v3 bootstrap: the user id comes from the CRC-checked U/V block. By policy the bootstrap frame's RSA
     * result is logged but ignored, so playback starts without waiting on it; later keyframes are
     * enforced by the keyframe queue.
     */
    const finishV3Bootstrap = async (
      frameIndex: number,
      reading: V3FrameReading & {userIdUv: number},
      decodeStart: number,
      frameCount: number
    ) => {
      const numericUserId = reading.userIdUv;
      if (reading.userIdY !== null && reading.userIdY !== numericUserId) {
        console.warn("[WatermarkVerify] v3 user id mismatch: Y payload differs from U/V block (U/V trusted)", {
          frameIndex,
          userIdUv: numericUserId,
          userIdY: reading.userIdY,
        });
      }
      console.log("[Frame0Decode] Decode phase timing", {
        frameDecodeMs: Math.round(performance.now() - decodeStart),
        format: "v3",
      });
      emitProgress("key_fetch", "Retrieving signer key");
      let key: CryptoKey | null = null;
      try {
        key = await importPublicKeyFromPem(await fetchPublicKeyPem(numericUserId));
      } catch (e) {
        debugLog("Fetch/import public key failed (non-blocking at bootstrap)", e);
      }
      if (!mounted) return;
      publicKeyRef.current = key;
      if (key && reading.signature) {
        emitProgress("rsa_verify", "Validating authenticity signature");
        try {
          const verified = await verifyV3Signature(key, reading.signature, frameCount, numericUserId);
          debugLog("Bootstrap v3 RSA result (informational; not enforced on the bootstrap frame)", {
            verified,
            frameIndex,
            frameCount,
          });
        } catch (e) {
          debugLog("Bootstrap v3 RSA threw (non-blocking)", e);
        }
      }
      if (!mounted) return;
      emitProgress("finalizing", "Final checks");
      console.log("[Frame0Decode] Verification finished", {
        status: "verified",
        elapsedMs: Math.round(performance.now() - verifyStartTime),
        format: "v3",
      });
      verifiedFrameIndicesRef.current = new Set([0]);
      watermarkFormatRef.current = "v3";
      setWatermarkFormat("v3");
      bootstrapUserIdRef.current = numericUserId;
      setVerifiedUserId(String(numericUserId));
      setStatus("verified");
      if (!callbackFiredRef.current && onVerificationCompleteRef.current) {
        callbackFiredRef.current = true;
        onVerificationCompleteRef.current("verified", String(numericUserId));
      }
    };

    void Promise.race([
      runVerification(),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Bootstrap verification timeout (${BOOTSTRAP_TIMEOUT_MS}ms)`)),
          BOOTSTRAP_TIMEOUT_MS
        )
      ),
    ]).catch((e) => {
      debugLog("Bootstrap verification aborted by timeout/error", e);
      if (!mounted) return;
      setStatus("failed");
      if (!callbackFiredRef.current && onVerificationCompleteRef.current) {
        callbackFiredRef.current = true;
        onVerificationCompleteRef.current("failed", null);
      }
    });

    return () => {
      mounted = false;
    };
  }, [enabled, videoUrl]);

  /**
   * Ongoing verification: a verify-ahead queue over the MP4's keyframes (the watermarked frames).
   * - Keyframe 0 is skipped by policy (playback starts without waiting on its RSA result).
   * - Keyframes are checked in time order, up to KEYFRAME_VERIFY_LOOKAHEAD_S ahead of the playhead.
   * - v3: a failed or uncorrectable (RS) signature, or a user id different from bootstrap, blocks playback.
   * - v2: only the Y-payload user id is checked (the v2 RSA can't pass on real outputs); a different
   *   user id blocks playback.
   * - Decode / network errors use the one-skip allowance: the next error blocks; a success resets it.
   * - A keyframe the playhead has reached must be verified within KEYFRAME_VERIFY_DEADLINE_MS of
   *   wall-clock playing time (paused, seeking and buffering time don't count), or playback is blocked.
   * - The playhead comes from requestVideoFrameCallback media times; seeks move the queue's floor to the
   *   keyframe at or before the new position. currentTime is read only where rVFC is unavailable.
   */
  useEffect(() => {
    if (!enabled || status !== "verified" || !videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    const format = watermarkFormatRef.current;
    const expectedUserId = bootstrapUserIdRef.current;
    if (!format || expectedUserId === null) return;

    type RvfcVideo = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: {mediaTime: number}) => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    const rvfcVideo = video as RvfcVideo;
    const hasRvfc = typeof rvfcVideo.requestVideoFrameCallback === "function";

    let stopped = false;
    let keyframes: WasmKeyframe[] = [];
    let frameCount = 0;
    let mediaTime = 0;
    let floorTime = 0;
    let seekPending = false;
    let rvfcHandle: number | null = null;
    const overdueMs = new Map<number, number>();
    const done = verifiedFrameIndicesRef.current;

    const pauseFromVerification = (reason: string) => {
      debugLog("playback: calling video.pause()", {
        reason,
        currentTime: video.currentTime,
        readyState: video.readyState,
      });
      programmaticPauseForDiagRef.current = true;
      video.pause();
    };

    const fail = (reason: string, detail?: Record<string, unknown>) => {
      if (stopped) return;
      stopped = true;
      console.warn("[WatermarkVerify] Ongoing verification failed", {reason, format, ...detail});
      setStatus("failed");
      pauseFromVerification(reason);
      if (!callbackFiredRef.current && onVerificationCompleteRef.current) {
        callbackFiredRef.current = true;
        onVerificationCompleteRef.current("failed", null);
      }
    };

    const ensureKey = async (): Promise<CryptoKey | null> => {
      if (publicKeyRef.current) return publicKeyRef.current;
      try {
        const key = await importPublicKeyFromPem(await fetchPublicKeyPem(expectedUserId));
        publicKeyRef.current = key;
        return key;
      } catch (e) {
        debugLog("Public key fetch failed during ongoing verification", e);
        return null;
      }
    };

    /** Once per video: refetch the key (it may have been rotated) before blocking on a mismatch. */
    const refreshKey = async (): Promise<CryptoKey | null> => {
      if (keyRefreshUsedRef.current) return null;
      keyRefreshUsedRef.current = true;
      try {
        const key = await importPublicKeyFromPem(await fetchPublicKeyPem(expectedUserId));
        publicKeyRef.current = key;
        return key;
      } catch {
        return null;
      }
    };

    /** Run a worker decode with the per-keyframe budget; on timeout reset the worker (stuck ffmpeg on iOS). */
    const withDecodeTimeout = async <T,>(work: Promise<T | null>): Promise<T | null> => {
      const budget = followupDecodeTimeoutRef.current;
      try {
        return await Promise.race([
          work,
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error(`Frame decode timeout (${budget}ms)`)), budget)
          ),
        ]);
      } catch (e) {
        if (e instanceof Error && e.message.includes("timeout")) {
          await disposeWasmVerificationSession();
        }
        return null;
      }
    };

    type CheckOutcome = {result: KeyframeCheckResult; reason: string};

    const checkKeyframeV3 = async (index: number): Promise<CheckOutcome> => {
      const frame = await withDecodeTimeout(getFrameYuvFromWasm(videoUrl, index));
      if (!frame) return {result: "error", reason: "frame_decode_failed"};
      const reading = readFrameV3(frame);
      if (!reading) return {result: "failed", reason: "frame_too_small_for_v3"};
      if (reading.signature === null) return {result: "failed", reason: "signature_unreadable"};
      if (reading.userId === null) return {result: "failed", reason: "user_id_unreadable"};
      if (reading.userId !== expectedUserId) return {result: "failed", reason: "user_id_changed"};
      const key = await ensureKey();
      if (!key) return {result: "error", reason: "public_key_unavailable"};
      if (await verifyV3Signature(key, reading.signature, frameCount, reading.userId)) {
        return {result: "verified", reason: "ok"};
      }
      const fresh = await refreshKey();
      if (fresh && (await verifyV3Signature(fresh, reading.signature, frameCount, reading.userId))) {
        return {result: "verified", reason: "ok_after_key_refresh"};
      }
      return {result: "failed", reason: "signature_mismatch"};
    };

    /**
     * v2 keyframes: the Y-payload user id must match the bootstrap user id. The legacy v2 RSA
     * (decodeAndVerifyFrameFromLuma, 5-pixel groups) is not used here: it fails on every keyframe of real
     * v2 outputs (2026-11-23), so v2 checks user-id consistency only.
     */
    const checkKeyframeV2 = async (index: number): Promise<CheckOutcome> => {
      const wasmFrame = await withDecodeTimeout(getFrameYFromWasm(videoUrl, index));
      if (!wasmFrame) return {result: "error", reason: "frame_decode_failed"};
      const {numericUserId} = decodeNumericUserIdDiagnosticsFromLuma(
        wasmFrame.yPlane,
        wasmFrame.width,
        wasmFrame.height
      );
      if (numericUserId === null) return {result: "error", reason: "user_id_unreadable"};
      if (numericUserId !== expectedUserId) return {result: "failed", reason: "user_id_changed"};
      return {result: "verified", reason: "ok"};
    };

    const applyOutcome = (kf: WasmKeyframe, outcome: CheckOutcome, checkMs: number) => {
      debugLog("playback: keyframe check", {
        format,
        index: kf.index,
        time: kf.time,
        result: outcome.result,
        reason: outcome.reason,
        checkMs,
        mediaTime,
      });
      if (outcome.result === "verified") {
        inconclusiveGraceUsedRef.current = false;
        done.add(kf.index);
        overdueMs.delete(kf.index);
        return;
      }
      if (outcome.result === "error" && !inconclusiveGraceUsedRef.current) {
        inconclusiveGraceUsedRef.current = true;
        done.add(kf.index);
        overdueMs.delete(kf.index);
        debugLog("Keyframe check inconclusive; one-skip allowance used", {index: kf.index, reason: outcome.reason});
        return;
      }
      fail(outcome.reason, {index: kf.index});
    };

    /** Earliest unverified keyframe in scope and within the look-ahead window. */
    const nextTarget = (): WasmKeyframe | null => {
      for (const kf of keyframes) {
        if (kf.time < floorTime - KEYFRAME_TIME_EPSILON_S || done.has(kf.index)) continue;
        return kf.time <= mediaTime + KEYFRAME_VERIFY_LOOKAHEAD_S ? kf : null;
      }
      return null;
    };

    /** Time of the keyframe at or before media time t (the keyframe whose GOP is on screen). */
    const keyframeFloorFor = (t: number): number => {
      let floor = 0;
      for (const kf of keyframes) {
        if (kf.time <= t + KEYFRAME_TIME_EPSILON_S) floor = kf.time;
        else break;
      }
      return floor;
    };

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const runQueue = async () => {
      let info: Awaited<ReturnType<typeof getWasmVideoTrackInfo>> = null;
      try {
        info = await getWasmVideoTrackInfo(videoUrl);
      } catch {
        info = null;
      }
      if (stopped) return;
      if (!info) {
        fail("track_info_unavailable");
        return;
      }
      frameCount = info.nbSamples;
      keyframes = info.keyframes.filter((kf) => kf.index !== 0).sort((a, b) => a.time - b.time);
      debugLog("Keyframe queue started", {format, frameCount, keyframes: keyframes.length});
      while (!stopped) {
        const kf = seekPending ? null : nextTarget();
        if (!kf) {
          await sleep(QUEUE_IDLE_POLL_MS);
          continue;
        }
        const checkStart = performance.now();
        const outcome = format === "v3" ? await checkKeyframeV3(kf.index) : await checkKeyframeV2(kf.index);
        if (stopped) return;
        applyOutcome(kf, outcome, Math.round(performance.now() - checkStart));
      }
    };

    const onFrame = (_now: number, meta: {mediaTime: number}) => {
      mediaTime = meta.mediaTime;
      if (seekPending) {
        floorTime = keyframeFloorFor(mediaTime);
        overdueMs.clear();
        seekPending = false;
        debugLog("playback: seek settled", {mediaTime, floorTime});
      }
      if (!stopped && rvfcVideo.requestVideoFrameCallback) {
        rvfcHandle = rvfcVideo.requestVideoFrameCallback(onFrame);
      }
    };
    const onSeeking = () => {
      seekPending = true;
      overdueMs.clear();
    };
    const onSeeked = () => {
      if (hasRvfc) return; // the next presented frame (rVFC) settles the new position
      mediaTime = video.currentTime;
      floorTime = keyframeFloorFor(mediaTime);
      seekPending = false;
    };
    const onPause = () => {
      const fromVerification = programmaticPauseForDiagRef.current;
      programmaticPauseForDiagRef.current = false;
      debugLog("playback: video 'pause' event", {fromVerification, currentTime: video.currentTime});
    };
    const onWaiting = () => {
      debugLog("playback: video 'waiting' (buffering)", {
        currentTime: video.currentTime,
        readyState: video.readyState,
        networkState: video.networkState,
      });
    };

    let lastTick = performance.now();
    const deadlineTimer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTick;
      lastTick = now;
      if (stopped) return;
      if (!hasRvfc && !video.seeking) mediaTime = video.currentTime; // fallback for browsers without rVFC
      const playing = !video.paused && !video.ended && !video.seeking && video.readyState >= 3;
      if (!playing || seekPending) return;
      for (const kf of keyframes) {
        if (kf.time > mediaTime + KEYFRAME_TIME_EPSILON_S) break;
        if (kf.time < floorTime - KEYFRAME_TIME_EPSILON_S || done.has(kf.index)) continue;
        const spent = (overdueMs.get(kf.index) ?? 0) + elapsed;
        overdueMs.set(kf.index, spent);
        if (spent >= KEYFRAME_VERIFY_DEADLINE_MS) {
          fail("verification_deadline_exceeded", {index: kf.index, keyframeTime: kf.time, spentMs: Math.round(spent)});
          return;
        }
      }
    }, DEADLINE_TICK_MS);

    if (hasRvfc && rvfcVideo.requestVideoFrameCallback) {
      rvfcHandle = rvfcVideo.requestVideoFrameCallback(onFrame);
    }
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    void runQueue();

    return () => {
      stopped = true;
      window.clearInterval(deadlineTimer);
      if (rvfcHandle !== null) rvfcVideo.cancelVideoFrameCallback?.(rvfcHandle);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
    };
  }, [enabled, status, videoRef, videoUrl]);

  return {status, verifiedUserId, watermarkFormat};
}
