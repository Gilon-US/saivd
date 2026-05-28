/**
 * React hook for in-browser verification of a single watermarked image.
 *
 * Given an image URL (typically the resolved `processed_url` returned by
 * /api/images), this hook:
 *   1. Loads the image into an `ImageBitmap` at intrinsic resolution.
 *   2. Runs {@link verifyImageWatermark} against it (decode + RSA verify).
 *   3. Exposes a discriminated-union `state` so the caller can render
 *      `verifying`, `ok` (with `numericUserId` for the QR badge), or `failed`.
 *
 * Mirrors the surface of `useWatermarkVerification` (the video hook) at
 * the property level — `verifiedUserId`, `isPlaybackBlocked`,
 * `verificationStatus` — so the QR-overlay JSX in ImageGrid can be a
 * near-direct copy of the video player's snippet.
 */
"use client";

import {useEffect, useRef, useState} from "react";

import {
  type ImageVerificationFailReason,
  type ImageVerificationResult,
  verifyImageWatermark,
} from "@/lib/image-watermark-verification";

export type ImageVerificationStatus = "idle" | "verifying" | "verified" | "failed";

export type UseImageWatermarkVerification = {
  /** numeric_user_id from the watermark, or null if not yet verified / failed. */
  verifiedUserId: number | null;
  /** True when verification has finished AND failed. Caller may hide the
   *  image or show a "not authentic" badge. */
  isVerificationFailed: boolean;
  /** Coarse status for spinners / log labels. */
  verificationStatus: ImageVerificationStatus;
  /** Reason for failure when isVerificationFailed is true. */
  failReason: ImageVerificationFailReason | null;
  /** Full result, in case the caller wants details. */
  result: ImageVerificationResult | null;
};

export function useImageWatermarkVerification(
  imageUrl: string | null | undefined,
  options?: {
    /** Whether to actually run verification. If false, the hook stays idle. */
    enabled?: boolean;
  },
): UseImageWatermarkVerification {
  const enabled = options?.enabled ?? true;
  const [state, setState] = useState<ImageVerificationStatus>("idle");
  const [result, setResult] = useState<ImageVerificationResult | null>(null);
  const cancelRef = useRef<{cancelled: boolean}>({cancelled: false});

  useEffect(() => {
    cancelRef.current.cancelled = true;
    cancelRef.current = {cancelled: false};
    const tag = cancelRef.current;

    if (!enabled || !imageUrl) {
      setState("idle");
      setResult(null);
      return;
    }

    let bmp: ImageBitmap | null = null;
    setState("verifying");
    setResult(null);

    (async () => {
      try {
        // Fetch as blob then createImageBitmap so we get intrinsic-resolution
        // pixels (a styled <img> may be downscaled, which breaks row sums).
        const res = await fetch(imageUrl, {credentials: "include"});
        if (!res.ok) {
          if (tag.cancelled) return;
          setResult({ok: false, reason: "fetch_failed", detail: `${res.status}`});
          setState("failed");
          return;
        }
        const blob = await res.blob();
        if (tag.cancelled) return;
        bmp = await createImageBitmap(blob);
        if (tag.cancelled) {
          bmp.close();
          bmp = null;
          return;
        }
        const verification = await verifyImageWatermark(bmp);
        if (tag.cancelled) return;
        setResult(verification);
        setState(verification.ok ? "verified" : "failed");
      } catch (e) {
        if (tag.cancelled) return;
        setResult({ok: false, reason: "malformed", detail: e instanceof Error ? e.message : String(e)});
        setState("failed");
      } finally {
        bmp?.close();
      }
    })();

    return () => {
      tag.cancelled = true;
      bmp?.close();
    };
  }, [imageUrl, enabled]);

  const verifiedUserId = result?.ok ? result.numericUserId : null;
  const isVerificationFailed = state === "failed";
  const failReason: ImageVerificationFailReason | null =
    result && !result.ok ? result.reason : null;

  return {
    verifiedUserId,
    isVerificationFailed,
    verificationStatus: state,
    failReason,
    result,
  };
}
