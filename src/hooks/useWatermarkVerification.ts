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

  // Capture a single frame from the video to ImageData. Returns null if canvas is tainted (cross-origin).
  const captureFrameToImageData = useCallback((): ImageData | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      return null;
    }
  }, [videoRef]);

  // Run verification on frame 0: decode userId → fetch key → verify.
  useEffect(() => {
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
        console.warn("[WatermarkVerification] Could not read frame (cross-origin or not ready)");
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
      } catch (e) {
        console.warn("[WatermarkVerification] Decode error", e);
      }
      if (numericUserId === null || numericUserId <= 0) {
        setStatus("failed");
        if (!callbackFiredRef.current && onVerificationComplete) {
          callbackFiredRef.current = true;
          onVerificationComplete("failed", null);
        }
        return;
      }

      let pem: string;
      try {
        pem = await fetchPublicKeyPem(numericUserId);
      } catch (e) {
        console.warn("[WatermarkVerification] Fetch public key error", e);
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
      } catch (e) {
        console.warn("[WatermarkVerification] Import key error", e);
        setStatus("failed");
        if (!callbackFiredRef.current && onVerificationComplete) {
          callbackFiredRef.current = true;
          onVerificationComplete("failed", null);
        }
        return;
      }
      publicKeyRef.current = key;

      const result = await decodeAndVerifyFrame(key, imageData);
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
      if (!callbackFiredRef.current && onVerificationComplete) {
        callbackFiredRef.current = true;
        onVerificationComplete("verified", String(numericUserId));
      }
    };

    const onCanReadFrame = () => {
      video.currentTime = 0;
    };

    const onSeeked = () => {
      runVerification();
    };

    if (video.readyState >= 2) {
      video.currentTime = 0;
      const t = setTimeout(() => {
        onSeeked();
      }, 0);
      return () => clearTimeout(t);
    }

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
        setStatus("failed");
        setVerifiedUserId(null);
        if (onVerificationComplete) onVerificationComplete("failed", null);
      } else {
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
