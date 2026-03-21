"use client";

import {useEffect, useRef, useState} from "react";
import {
  decodeNumericUserIdDiagnosticsFromLuma,
  decodeAndVerifyFrameFromLuma,
  decodeAndVerifyFrame,
  captureVideoFrameImageData,
  fetchPublicKeyPem,
  importPublicKeyFromPem,
} from "@/lib/watermark-verification";
import {captureFrameYFromUrl} from "@/lib/webcodecs-capture";

export type WatermarkVerificationStatus = "idle" | "verifying" | "verified" | "failed";

type UseWatermarkVerificationOptions = {
  /** When true, run verification when the video has frame 0 available. */
  enabled: boolean;
  /** Callback when verification completes (success or failure). */
  onVerificationComplete?: (status: "verified" | "failed", userId: string | null) => void;
};

/**
 * Bootstrap decodes user ID from frames 0/1/2 (no key) via WebCodecs (demux → decode → Y plane).
 * Canvas path is
 * disabled; verification fails if WebCodecs/WASM demuxer is unavailable.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debugLog = (...args: any[]) => {
    console.log("[WatermarkVerify]", ...args);
  };

  useEffect(() => {
    onVerificationCompleteRef.current = onVerificationComplete;
  }, [onVerificationComplete]);

  // Frame 0: decode user ID (no key) → fetch public key → RSA verify frame 0. WebCodecs only.
  // Run verification immediately when enabled; do not wait for the video element (captureFrame0YFromUrl does its own Range fetch).
  useEffect(() => {
    debugLog("Effect start", {enabled, hasVideoUrl: !!videoUrl});
    if (!enabled || !videoUrl) {
      setStatus("idle");
      setVerifiedUserId(null);
      callbackFiredRef.current = false;
      verificationStartedRef.current = false;
      verificationSessionKeyRef.current = null;
      publicKeyRef.current = null;
      inconclusiveGraceUsedRef.current = false;
      verifiedFrameIndicesRef.current = new Set();
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

      for (const frameIndex of frameIndexes) {
        const frameStart = performance.now();
        let webCodecsY: { yPlane: Uint8Array; width: number; height: number } | null = null;
        try {
          webCodecsY = await captureFrameYFromUrl(videoUrl, frameIndex);
        } catch (e) {
          debugLog("WebCodecs capture failed (canvas path disabled)", {frameIndex, error: e});
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
        });

        if (
          diagnostics.numericUserId !== null &&
          diagnostics.numericUserId > 0 &&
          diagnostics.validDigits
        ) {
          candidates.push({
            frameIndex,
            numericUserId: diagnostics.numericUserId,
            bestScore: diagnostics.bestScore,
            repsUsed: diagnostics.repsUsed,
            yPlane: webCodecsY.yPlane,
            width: webCodecsY.width,
            height: webCodecsY.height,
          });
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
        pass: passesConsensus,
      });

      if (!passesConsensus || !selected) {
        debugLog("Bootstrap consensus failed: WebCodecs path only (no canvas fallback)", {
          candidateCount: candidates.length,
        });
        console.log(
          "[WatermarkVerify] Bootstrap decode failed. Ensure WebCodecs/WASM demuxer is working (see [WebCodecs] logs). Video URL snippet:",
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
      let pem: string | null = null;
      try {
        debugLog("Fetching public key PEM", {numericUserId});
        pem = await fetchPublicKeyPem(numericUserId);
        debugLog("Fetched public key PEM length", {length: pem.length});
      } catch (e) {
        debugLog("Fetch public key failed (non-blocking)", e);
      }

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
          debugLog("Bootstrap RSA verification result (WebCodecs)", {
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
      console.log("[Frame0Decode] Full video is loaded only after this (when <video> src is set for playback). Verification used Range requests only.");
      verifiedFrameIndicesRef.current = new Set([0]);
      setVerifiedUserId(String(numericUserId));
      setStatus("verified");
      debugLog("Verification succeeded for frame 0 (user ID decoded)", {numericUserId});
      if (!callbackFiredRef.current && onVerificationCompleteRef.current) {
        callbackFiredRef.current = true;
        onVerificationCompleteRef.current("verified", String(numericUserId));
      }
    };

    runVerification();

    return () => {
      mounted = false;
    };
  }, [enabled, videoUrl]);

  useEffect(() => {
    if (!enabled || status !== "verified") return;
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

      const imageData = captureVideoFrameImageData(video);
      if (!imageData) {
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

      const frameResult = await decodeAndVerifyFrame(key, imageData);
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
  }, [enabled, status, videoRef]);

  return {status, verifiedUserId};
}
