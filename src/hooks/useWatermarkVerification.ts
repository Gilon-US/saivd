"use client";

import {useEffect, useRef, useState, useCallback} from "react";
import {
  decodeNumericUserIdFromFrame,
  decodeAndVerifyFrame,
  fetchPublicKeyPem,
  importPublicKeyFromPem,
} from "@/lib/watermark-verification";

export type WatermarkVerificationStatus = "idle" | "verifying" | "verified" | "failed";

type UseWatermarkVerificationOptions = {
  /** When true, run verification when the video has frame 0 available. */
  enabled: boolean;
  /** Callback when verification completes (success or failure). */
  onVerificationComplete?: (status: "verified" | "failed", userId: string | null) => void;
};

/**
 * Captures frame 0 from the video, decodes numeric_user_id, fetches public key, verifies frame 0.
 * Optionally verifies frames 10, 20, ... during playback; if any fail, reports failed.
 * Requires video to be same-origin or CORS-enabled so canvas getImageData is allowed.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debugLog = (...args: any[]) => {
    console.log("[WatermarkVerify]", ...args);
  };

  // Capture a single frame from the video to ImageData. Returns null if canvas is tainted (cross-origin).
  const captureFrameToImageData = useCallback((): ImageData | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
    debugLog("Capturing frame for analysis", {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      currentTime: video.currentTime,
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      debugLog("Frame captured successfully", {
        width: imageData.width,
        height: imageData.height,
        dataLength: imageData.data.length,
      });
      return imageData;
    } catch (err) {
      debugLog("Frame capture failed (likely cross-origin video or CORS – canvas tainted)", {
        error: err instanceof Error ? err.message : String(err),
        videoSrc: video.src?.slice(0, 80),
      });
      return null;
    }
  }, [videoRef]);

  // Run verification on frame 0: decode userId → fetch key → verify.
  useEffect(() => {
    debugLog("Effect start", {enabled, hasVideoUrl: !!videoUrl, hasVideoRef: !!videoRef.current});
    if (!enabled || !videoUrl || !videoRef.current) {
      setStatus("idle");
      setVerifiedUserId(null);
      callbackFiredRef.current = false;
      return;
    }

    const video = videoRef.current;
    setStatus("verifying");

    const runVerification = async () => {
      const imageData = captureFrameToImageData();
      if (!imageData) {
        debugLog(
          "Playback decode failed: could not read frame. Video may be cross-origin (presigned URL) without CORS – canvas is tainted and getImageData() is blocked. Ensure the video URL is served with Access-Control-Allow-Origin or use same-origin proxy."
        );
        setStatus("failed");
        if (!callbackFiredRef.current && onVerificationComplete) {
          callbackFiredRef.current = true;
          onVerificationComplete("failed", null);
        }
        return;
      }

      let numericUserId: number | null = null;
      try {
        numericUserId = decodeNumericUserIdFromFrame(imageData);
        debugLog("Decoded numericUserId from frame 0", {numericUserId});
      } catch (e) {
        debugLog("Decode error", e);
      }
      if (numericUserId === null || numericUserId <= 0) {
        debugLog("numericUserId invalid after decode", {numericUserId});
        setStatus("failed");
        if (!callbackFiredRef.current && onVerificationComplete) {
          callbackFiredRef.current = true;
          onVerificationComplete("failed", null);
        }
        return;
      }

      let pem: string;
      try {
        debugLog("Fetching public key PEM", {numericUserId});
        pem = await fetchPublicKeyPem(numericUserId);
        debugLog("Fetched public key PEM length", {length: pem.length});
      } catch (e) {
        debugLog("Fetch public key error", e);
        setStatus("failed");
        if (!callbackFiredRef.current && onVerificationComplete) {
          callbackFiredRef.current = true;
          onVerificationComplete("failed", null);
        }
        return;
      }

      let key: CryptoKey;
      try {
        key = await importPublicKeyFromPem(pem);
        debugLog("Imported public key");
      } catch (e) {
        debugLog("Import key error", e);
        setStatus("failed");
        if (!callbackFiredRef.current && onVerificationComplete) {
          callbackFiredRef.current = true;
          onVerificationComplete("failed", null);
        }
        return;
      }
      publicKeyRef.current = key;

      const result = await decodeAndVerifyFrame(key, imageData);
      debugLog("Frame 0 verification result", {verified: result.verified, numericUserId: result.numericUserId});
      if (!result.verified) {
        setStatus("failed");
        if (!callbackFiredRef.current && onVerificationComplete) {
          callbackFiredRef.current = true;
          onVerificationComplete("failed", null);
        }
        return;
      }

      verifiedFrameIndicesRef.current = new Set([0]);
      setVerifiedUserId(String(numericUserId));
      setStatus("verified");
      debugLog("Verification succeeded for frame 0", {numericUserId});
      if (!callbackFiredRef.current && onVerificationComplete) {
        callbackFiredRef.current = true;
        onVerificationComplete("verified", String(numericUserId));
      }
    };

    const onCanReadFrame = () => {
      video.currentTime = 0;
    };

    const onSeeked = () => {
      debugLog("Video seeked to frame 0, starting playback decode");
      runVerification();
    };

    if (video.readyState >= 2) {
      debugLog("Video already has data (readyState >= 2), seeking to 0 for frame 0");
      video.currentTime = 0;
      const t = setTimeout(() => {
        onSeeked();
      }, 0);
      return () => clearTimeout(t);
    }

    debugLog("Waiting for video loadeddata then seeked to frame 0", {
      readyState: video.readyState,
      videoUrl: videoUrl?.slice(0, 60),
    });
    video.addEventListener("loadeddata", onCanReadFrame, {once: true});
    video.addEventListener("seeked", onSeeked, {once: true});
    video.currentTime = 0;

    return () => {
      video.removeEventListener("loadeddata", onCanReadFrame);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [enabled, videoUrl, onVerificationComplete, captureFrameToImageData, videoRef]);

  // Optional: verify frames 10, 20, ... during playback using requestVideoFrameCallback (or time-based fallback).
  useEffect(() => {
    if (status !== "verified" || !videoRef.current || !publicKeyRef.current) return;

    const video = videoRef.current;
    let cancelled = false;
    let handleId: number | undefined;

    const verifyAtFrameIndex = async (frameIndex: number) => {
      if (cancelled || !publicKeyRef.current) return;
      if (verifiedFrameIndicesRef.current.has(frameIndex)) return;
      const imageData = captureFrameToImageData();
      if (!imageData) return;
      const result = await decodeAndVerifyFrame(publicKeyRef.current, imageData);
      if (cancelled) return;
      if (!result.verified) {
        debugLog("Verification failed for subsequent frame", {frameIndex});
        setStatus("failed");
        setVerifiedUserId(null);
        if (onVerificationComplete) onVerificationComplete("failed", null);
      } else {
        debugLog("Verification succeeded for subsequent frame", {frameIndex});
        verifiedFrameIndicesRef.current.add(frameIndex);
      }
    };

    type VideoFrameCallback = (now: number, metadata: { mediaTime: number; presentedFrames: number }) => void;
    const videoWithRFC = video as HTMLVideoElement & {
      requestVideoFrameCallback?(callback: VideoFrameCallback): number;
      cancelVideoFrameCallback?(id: number): void;
    };

    if (typeof videoWithRFC.requestVideoFrameCallback === "function") {
      const tick: VideoFrameCallback = (_now, metadata) => {
        if (cancelled || !videoRef.current) return;
        const frameIndex = metadata.presentedFrames;
        if (frameIndex > 0 && frameIndex % 10 === 0) {
          void verifyAtFrameIndex(frameIndex);
        }
        if (!video.paused && !video.ended) {
          handleId = videoWithRFC.requestVideoFrameCallback!(tick);
        }
      };
      handleId = videoWithRFC.requestVideoFrameCallback(tick);
      return () => {
        cancelled = true;
        if (handleId !== undefined && typeof videoWithRFC.cancelVideoFrameCallback === "function") {
          videoWithRFC.cancelVideoFrameCallback(handleId);
        }
      };
    }

    // Fallback: time-based sampling (assume ~30fps). Check every 0.5s if we're near frame 10, 20, ...
    const fps = 30;
    const interval = setInterval(() => {
      if (cancelled || !videoRef.current || video.paused || video.ended) return;
      const t = video.currentTime;
      const frameIndex = Math.round(t * fps);
      if (frameIndex > 0 && frameIndex % 10 === 0) {
        void verifyAtFrameIndex(frameIndex);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status, onVerificationComplete, captureFrameToImageData, videoRef]);

  return {status, verifiedUserId};
}
