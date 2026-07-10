"use client";

import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {PresentationQrFlipButton} from "@/components/presentation/PresentationQrFlipButton";
import type {ImageViewResult} from "@/lib/image-view-url";
import {publicImageProcessedVerificationUrl} from "@/lib/image-verification-url";
import {useImageWatermarkVerification} from "@/hooks/useImageWatermarkVerification";
import {usePublicQrOverlayPosition} from "@/hooks/usePublicQrOverlayPosition";

type PublicImageViewProps = {
  imageId: string;
  result: ImageViewResult;
  embed?: boolean;
};

export function PublicImageView({imageId, result, embed = false}: PublicImageViewProps) {
  const shellClass = embed
    ? "relative flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-900"
    : "relative flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-900";

  const verification = useImageWatermarkVerification(imageId, {
    enabled: result.ok,
    verifyUrl: result.ok ? publicImageProcessedVerificationUrl(imageId) : null,
  });
  const {position: qrOverlayPosition, logoUrl: creatorLogoUrl} = usePublicQrOverlayPosition(
    verification.verifiedUserId,
  );

  if (!result.ok) {
    if (result.status === 404) {
      return (
        <div className={shellClass}>
          <p className="text-sm text-gray-600 dark:text-gray-400">Image not found</p>
        </div>
      );
    }

    return (
      <div className={shellClass}>
        <p className="text-sm text-red-600 dark:text-red-400">{result.message}</p>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="relative inline-block max-h-full max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-saivd-public-image={imageId}
          src={result.viewUrl}
          alt="Verified image"
          crossOrigin="anonymous"
          fetchPriority="high"
          className="block max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
        />

        {verification.verifiedUserId !== null && !verification.isVerificationFailed && (
          <PresentationQrFlipButton
            numericUserId={verification.verifiedUserId}
            mediaKind="image"
            mediaId={imageId}
            enabled
            position={qrOverlayPosition}
            logoUrl={creatorLogoUrl}
          />
        )}

        {verification.verificationStatus === "verifying" && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white sm:top-4 sm:left-4">
            <LoadingSpinner size="sm" /> Verifying…
          </div>
        )}

        {verification.isVerificationFailed && !embed && (
          <div className="absolute bottom-2 left-2 right-2 z-20 rounded-md bg-amber-600/90 px-3 py-2 text-xs text-white sm:bottom-4 sm:left-4 sm:right-4">
            <div className="font-medium">Watermark verification failed</div>
            <div className="opacity-90">
              {verification.failReason === "invalid_signature"
                ? "Signature does not match the public key."
                : verification.failReason === "fetch_failed"
                  ? verification.result && !verification.result.ok &&
                      verification.result.detail?.startsWith("image_fetch_failed")
                    ? "Could not load the watermarked image for verification."
                    : "Could not fetch the public key."
                  : verification.failReason === "no_watermark"
                    ? "No watermark detected."
                    : verification.result && !verification.result.ok
                      ? (verification.result.detail ?? "Image could not be decoded.")
                      : "Image could not be decoded."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
