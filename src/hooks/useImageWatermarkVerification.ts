"use client";

import {useEffect, useRef, useState} from "react";

import {
  imageProcessedVerificationUrl,
  publicImageProcessedVerificationUrl,
} from "@/lib/image-verification-url";
import {decodeBitmapFromBlob} from "@/lib/image-bitmap-decode";
import {decodeRgbaFromPngBuffer} from "@/lib/image-png-decode";
import {isIosWebKit} from "@/lib/ios-webkit";
import {
  blueRowSumsFromRgba,
  imageBitmapToBlueRowSums,
  type ImageVerificationFailReason,
  type ImageVerificationResult,
  verifyImageRegions,
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

/** QA beacon — removable after iOS QA (`VERIFY_TELEMETRY=0` disables server log). */
function reportVerifyFailure(info: {
  reason: string;
  detail?: string;
  endpoint: string;
  path?: string;
}) {
  try {
    const payload = JSON.stringify({
      ...info,
      ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      ts: Date.now(),
    });
    navigator.sendBeacon?.("/api/public/telemetry/verify", payload);
  } catch {
    /* non-blocking */
  }
}

/**
 * Verify a watermarked image via same-origin processed PNG proxy.
 *
 * Desktop: auth `/api/images/{id}/processed` + canvas decode (unchanged).
 * iOS WebKit only: public processed URL + raw PNG decode (no color management).
 */
export function useImageWatermarkVerification(
  imageId: string | null | undefined,
  options?: {enabled?: boolean; verifyUrl?: string | null},
): UseImageWatermarkVerification {
  const enabled = options?.enabled ?? true;
  const ios = typeof window !== "undefined" && isIosWebKit();
  const verifyUrl =
    options?.verifyUrl ??
    (imageId?.trim()
      ? ios
        ? publicImageProcessedVerificationUrl(imageId.trim())
        : imageProcessedVerificationUrl(imageId.trim())
      : null);

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

    const useIosPath = isIosWebKit();

    (async () => {
      try {
        const res = await fetch(verifyUrl, {
          credentials: useIosPath ? "omit" : "include",
        });
        if (!res.ok) {
          if (tag.cancelled) return;
          const fail = {
            ok: false as const,
            reason: "fetch_failed" as const,
            detail: `image_fetch_failed: ${res.status}`,
          };
          reportVerifyFailure({
            reason: fail.reason,
            detail: fail.detail,
            endpoint: verifyUrl,
            path: useIosPath ? "ios-public" : "desktop-auth",
          });
          setResult(fail);
          setState("failed");
          return;
        }

        const buf = await res.arrayBuffer();
        if (tag.cancelled) return;

        let verification: ImageVerificationResult;

        if (useIosPath) {
          try {
            const {width, height, rgba} = decodeRgbaFromPngBuffer(buf);
            const regions = blueRowSumsFromRgba(width, height, rgba);
            if ("error" in regions) {
              verification = {ok: false, reason: "malformed", detail: regions.error};
            } else {
              verification = await verifyImageRegions(regions);
            }
          } catch {
            bmp = await decodeBitmapFromBlob(new Blob([buf]), "strict");
            if (tag.cancelled) {
              bmp.close();
              bmp = null;
              return;
            }
            verification = await verifyImageWatermark(bmp);
          }
        } else {
          bmp = await decodeBitmapFromBlob(new Blob([buf]), "strict");
          if (tag.cancelled) {
            bmp.close();
            bmp = null;
            return;
          }
          verification = await verifyImageWatermark(bmp);
        }

        if (tag.cancelled) return;
        if (!verification.ok) {
          reportVerifyFailure({
            reason: verification.reason,
            detail: verification.detail,
            endpoint: verifyUrl,
            path: useIosPath ? "ios-raw-or-canvas-fallback" : "desktop-canvas",
          });
        }
        setResult(verification);
        setState(verification.ok ? "verified" : "failed");
      } catch (e) {
        if (tag.cancelled) return;
        const detail = e instanceof Error ? e.message : String(e);
        reportVerifyFailure({
          reason: "malformed",
          detail,
          endpoint: verifyUrl,
          path: useIosPath ? "ios" : "desktop",
        });
        setResult({ok: false, reason: "malformed", detail});
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
