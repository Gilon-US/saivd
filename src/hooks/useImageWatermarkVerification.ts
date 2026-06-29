"use client";

import {useEffect, useRef, useState} from "react";

import {imageProcessedVerificationUrl} from "@/lib/image-verification-url";
import {
  type ImageVerificationFailReason,
  type ImageVerificationResult,
  verifyImageWatermark,
} from "@/lib/image-watermark-verification";

export type ImageVerificationStatus = "idle" | "verifying" | "verified" | "failed";

export type UseImageWatermarkVerification = {
  verifiedUserId: number | null;
  isVerificationFailed: boolean;
  verificationStatus: ImageVerificationStatus;
  failReason: ImageVerificationFailReason | null;
  result: ImageVerificationResult | null;
};

/**
 * Verify a watermarked image via same-origin GET /api/images/[id]/processed
 * (adapted from useWatermarkVerification — video uses WASM + play URL; images
 * use a server proxy so createImageBitmap is not blocked by Wasabi CORS).
 */
export function useImageWatermarkVerification(
  imageId: string | null | undefined,
  options?: {enabled?: boolean; verifyUrl?: string | null},
): UseImageWatermarkVerification {
  const enabled = options?.enabled ?? true;
  const verifyUrl =
    options?.verifyUrl ??
    (imageId?.trim() ? imageProcessedVerificationUrl(imageId.trim()) : null);

  const [state, setState] = useState<ImageVerificationStatus>("idle");
  const [result, setResult] = useState<ImageVerificationResult | null>(null);
  const cancelRef = useRef<{cancelled: boolean}>({cancelled: false});

  useEffect(() => {
    cancelRef.current.cancelled = true;
    cancelRef.current = {cancelled: false};
    const tag = cancelRef.current;

    if (!enabled || !verifyUrl) {
      setState("idle");
      setResult(null);
      return;
    }

    let bmp: ImageBitmap | null = null;
    setState("verifying");
    setResult(null);

    (async () => {
      try {
        const res = await fetch(verifyUrl, {credentials: "include"});
        if (!res.ok) {
          if (tag.cancelled) return;
          setResult({
            ok: false,
            reason: "fetch_failed",
            detail: `image_fetch_failed: ${res.status}`,
          });
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
        setResult({
          ok: false,
          reason: "malformed",
          detail: e instanceof Error ? e.message : String(e),
        });
        setState("failed");
      } finally {
        bmp?.close();
      }
    })();

    return () => {
      tag.cancelled = true;
      bmp?.close();
    };
  }, [verifyUrl, enabled]);

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
