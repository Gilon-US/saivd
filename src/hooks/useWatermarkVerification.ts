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
  getFrameYFromWasm,
  prewarmWasmVerificationSession,
  scheduleDisposeWasmVerificationSession,
} from "@/lib/wasm-watermark-verification-client";

export type WatermarkVerificationStatus = "idle" | "verifying" | "verified" | "failed";

type UseWatermarkVerificationOptions = {
  /** When true, run verification when the video has frame 0 available. */
  enabled: boolean;
  /** Callback when verification completes (success or failure). */
  onVerificationComplete?: (status: "verified" | "failed", userId: string | null) => void;
};

const SESSION_KEEPALIVE_TTL_MS = 45000;
const FRAME0_DECODE_TIMEOUT_MS = 20000;
const FOLLOWUP_FRAME_DECODE_TIMEOUT_MS = 8000;
const BOOTSTRAP_TIMEOUT_MS = 30000;

/**
 * Bootstrap decodes user ID from frames 0/1/2 (no key) via Web Worker + ffmpeg.wasm (demux → decode → Y plane).
 * Canvas/WebCodecs are not used for verification; fails if the WASM worker cannot decode.
 */
export function useWatermarkVerification(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  videoUrl: string | null,
  options: UseWatermarkVerificationOptions
) {
  const {enabled, onVerificationComplete} = options;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debugLog = (...args: any[]) => {
    console.log("[WatermarkVerify]", ...args);
  };

  useEffect(() => {
    onVerificationCompleteRef.current = onVerificationComplete;
  }, [onVerificationComplete]);

  useEffect(() => {
    if (!enabled || !videoUrl) return;
    if (prewarmStartedRef.current && verificationSessionKeyRef.current === videoUrl) return;
    prewarmStartedRef.current = true;
    verificationSessionKeyRef.current = videoUrl;
    const t0 = performance.now();
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

      for (const frameIndex of frameIndexes) {
        const frameStart = performance.now();
        const frameDecodeTimeoutMs =
          frameIndex === 0 ? FRAME0_DECODE_TIMEOUT_MS : FOLLOWUP_FRAME_DECODE_TIMEOUT_MS;
        let webCodecsY: Awaited<ReturnType<typeof getFrameYFromWasm>> = null;
        try {
          webCodecsY = await Promise.race([
            getFrameYFromWasm(videoUrl, frameIndex),
            new Promise<null>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Frame decode timeout (${frameDecodeTimeoutMs}ms)`)),
                frameDecodeTimeoutMs
              )
            ),
          ]);
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
          workerTimings: webCodecsY.timings ?? null,
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
      const elapsed = Math.round(performance.now() - verifyStartTime);
      console.log("[Frame0Decode] Verification finished", { status: "verified", elapsedMs: elapsed });
      console.log("[Frame0Decode] Full video loads only after this (when <video> src is set). Verification used Range requests + WASM decode.");
      verifiedFrameIndicesRef.current = new Set([0]);
      setVerifiedUserId(String(numericUserId));
      setStatus("verified");
      debugLog("Verification succeeded for frame 0 (user ID decoded)", {numericUserId});
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

  useEffect(() => {
    if (!enabled || status !== "verified" || !videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (video.paused || video.ended) return;
      const key = publicKeyRef.current;
      if (!key) return;

      const fps = Number.isFinite(video.getVideoPlaybackQuality?.().totalVideoFrames)
        ? Math.max(1, video.getVideoPlaybackQuality().totalVideoFrames / Math.max(0.001, video.currentTime || 0.001))
        : 30;
      const currentFrame = Math.floor(video.currentTime * fps);
      const checkpoint = Math.floor(currentFrame / 10) * 10;
      if (checkpoint <= 0 || verifiedFrameIndicesRef.current.has(checkpoint)) return;

      let wasmFrame: Awaited<ReturnType<typeof getFrameYFromWasm>> = null;
      try {
        wasmFrame = await getFrameYFromWasm(videoUrl, checkpoint);
      } catch {
        wasmFrame = null;
      }
      if (!wasmFrame) {
        if (inconclusiveGraceUsedRef.current) {
          setStatus("failed");
          video.pause();
          if (!callbackFiredRef.current && onVerificationCompleteRef.current) {
            callbackFiredRef.current = true;
            onVerificationCompleteRef.current("failed", null);
          }
        } else {
          inconclusiveGraceUsedRef.current = true;
          verifiedFrameIndicesRef.current.add(checkpoint);
        }
        return;
      }

      const frameResult = await decodeAndVerifyFrameFromLuma(
        key,
        wasmFrame.yPlane,
        wasmFrame.width,
        wasmFrame.height
      );
      if (frameResult.verified) {
        inconclusiveGraceUsedRef.current = false;
        verifiedFrameIndicesRef.current.add(checkpoint);
        return;
      }

      if (frameResult.numericUserId === null) {
        if (inconclusiveGraceUsedRef.current) {
          setStatus("failed");
          video.pause();
          if (!callbackFiredRef.current && onVerificationCompleteRef.current) {
            callbackFiredRef.current = true;
            onVerificationCompleteRef.current("failed", null);
          }
        } else {
          inconclusiveGraceUsedRef.current = true;
          verifiedFrameIndicesRef.current.add(checkpoint);
        }
        return;
      }

      // Cryptographic mismatch -> immediate stop
      setStatus("failed");
      video.pause();
      if (!callbackFiredRef.current && onVerificationCompleteRef.current) {
        callbackFiredRef.current = true;
        onVerificationCompleteRef.current("failed", null);
      }
    };

    const interval = window.setInterval(() => {
      void tick();
    }, 300);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, status, videoRef, videoUrl]);

  return {status, verifiedUserId};
}
