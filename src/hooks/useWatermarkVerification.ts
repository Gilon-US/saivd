"use client";

import {useEffect, useRef, useState} from "react";
import {
  decodeNumericUserIdFromLuma,
  decodeAndVerifyFrameFromLuma,
  fetchPublicKeyPem,
  importPublicKeyFromPem,
} from "@/lib/watermark-verification";
import { captureFrame0YFromUrl } from "@/lib/webcodecs-capture";

export type WatermarkVerificationStatus = "idle" | "verifying" | "verified" | "failed";

type UseWatermarkVerificationOptions = {
  /** When true, run verification when the video has frame 0 available. */
  enabled: boolean;
  /** Callback when verification completes (success or failure). */
  onVerificationComplete?: (status: "verified" | "failed", userId: string | null) => void;
};

/**
 * Frame 0 is the only frame with right-side data that can be read without the RSA key. We extract
 * the user ID from frame 0 (no key) via WebCodecs (demux → decode → Y plane). Canvas path is
 * disabled; verification fails if WebCodecs/WASM demuxer is unavailable.
 */
export function useWatermarkVerification(
  _videoRef: React.RefObject<HTMLVideoElement | null>,
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

  // Frame 0: decode user ID (no key) → fetch public key → RSA verify frame 0. WebCodecs only.
  // Run verification immediately when enabled; do not wait for the video element (captureFrame0YFromUrl does its own Range fetch).
  useEffect(() => {
    debugLog("Effect start", {enabled, hasVideoUrl: !!videoUrl});
    if (!enabled || !videoUrl) {
      setStatus("idle");
      setVerifiedUserId(null);
      callbackFiredRef.current = false;
      return;
    }

    setStatus("verifying");
    let mounted = true;

    const runVerification = async () => {
      let numericUserId: number | null = null;
      let webCodecsY: { yPlane: Uint8Array; width: number; height: number } | null = null;

      try {
        webCodecsY = await captureFrame0YFromUrl(videoUrl);
      } catch (e) {
        debugLog("WebCodecs capture failed (canvas path disabled)", e);
      }

      if (!mounted) return;

      if (webCodecsY) {
        debugLog("Using WebCodecs Y plane for frame 0 (accurate extraction)");
        numericUserId = decodeNumericUserIdFromLuma(
          webCodecsY.yPlane,
          webCodecsY.width,
          webCodecsY.height
        );
        debugLog("Decoded numericUserId from frame 0 (WebCodecs)", {numericUserId});
      }

      if (!webCodecsY || numericUserId === null || numericUserId <= 0) {
        debugLog("Frame 0 decode failed: WebCodecs path only (no canvas fallback)", {
          hadWebCodecsY: !!webCodecsY,
          numericUserId: numericUserId ?? null,
        });
        console.log(
          "[WatermarkVerify] Frame 0 decode failed. Ensure WebCodecs/WASM demuxer is working (see [WebCodecs] logs). Video URL snippet:",
          videoUrl?.slice(-80)
        );
        if (mounted) setStatus("failed");
        if (mounted && !callbackFiredRef.current && onVerificationComplete) {
          callbackFiredRef.current = true;
          onVerificationComplete("failed", null);
        }
        return;
      }

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

      if (key && webCodecsY) {
        try {
          const result = await decodeAndVerifyFrameFromLuma(
            key,
            webCodecsY.yPlane,
            webCodecsY.width,
            webCodecsY.height
          );
          debugLog("Frame 0 RSA verification result (WebCodecs)", {
            verified: result.verified,
            numericUserId: result.numericUserId,
          });
        } catch (e) {
          debugLog("RSA verification threw (non-blocking)", e);
        }
      }

      if (!mounted) return;
      verifiedFrameIndicesRef.current = new Set([0]);
      setVerifiedUserId(String(numericUserId));
      setStatus("verified");
      debugLog("Verification succeeded for frame 0 (user ID decoded)", {numericUserId});
      if (!callbackFiredRef.current && onVerificationComplete) {
        callbackFiredRef.current = true;
        onVerificationComplete("verified", String(numericUserId));
      }
    };

    runVerification();

    return () => {
      mounted = false;
    };
  }, [enabled, videoUrl, onVerificationComplete]);

  // Subsequent-frame verification (10, 20, ...) is disabled: canvas path is off and WebCodecs
  // frame capture for arbitrary frames is not yet implemented. Only frame 0 is verified via WebCodecs.

  return {status, verifiedUserId};
}
