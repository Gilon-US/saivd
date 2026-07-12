"use client";

import {useEffect, useMemo, useRef} from "react";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {PresentationQrFlipButton} from "@/components/presentation/PresentationQrFlipButton";
import {usePublicQrOverlayPosition} from "@/hooks/usePublicQrOverlayPosition";
import {useWatermarkVerification} from "@/hooks/useWatermarkVerification";
import type {PlaybackResult} from "@/lib/playback-url";
import {prewarmWasmVerificationSession} from "@/lib/wasm-watermark-verification-client";

type PublicVideoViewProps = {
  videoId: string;
  result: PlaybackResult;
  embed?: boolean;
};

function parseVerifiedNumericUserId(verifiedUserId: string | null): number | null {
  if (verifiedUserId == null || verifiedUserId.trim() === "") return null;
  const n = Number(verifiedUserId);
  return Number.isFinite(n) ? n : null;
}

export function PublicVideoView({videoId, result, embed = false}: PublicVideoViewProps) {
  const shellClass = embed
    ? "relative flex h-full w-full items-center justify-center bg-black"
    : "relative flex min-h-screen items-center justify-center bg-black p-4";

  const playbackUrl = result.ok ? result.playbackUrl : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const {status: verificationStatus, verifiedUserId} = useWatermarkVerification(
    videoRef,
    playbackUrl,
    {enabled: result.ok},
  );

  const numericUserId = useMemo(
    () => parseVerifiedNumericUserId(verifiedUserId),
    [verifiedUserId],
  );
  const {position: qrOverlayPosition, logoUrl: creatorLogoUrl} =
    usePublicQrOverlayPosition(numericUserId);

  useEffect(() => {
    if (!playbackUrl) return;
    void prewarmWasmVerificationSession(playbackUrl);
  }, [playbackUrl]);

  const showPresentationQr =
    numericUserId !== null && verificationStatus === "verified";
  const isVerificationFailed = verificationStatus === "failed";

  if (!result.ok) {
    if (result.status === 404) {
      return (
        <div className={shellClass}>
          <p className="text-sm text-gray-300">Video not found</p>
        </div>
      );
    }

    return (
      <div className={shellClass}>
        <p className="text-sm text-red-400">{result.message}</p>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div
        className={
          embed
            ? "relative h-full w-full"
            : "relative w-full max-w-5xl aspect-video overflow-hidden rounded-lg bg-black"
        }>
        <video
          ref={videoRef}
          data-saivd-public-video={videoId}
          src={result.playbackUrl}
          controls
          playsInline
          crossOrigin="anonymous"
          className={embed ? "h-full w-full" : "h-full w-full object-contain"}
        />

        {showPresentationQr && numericUserId !== null && (
          <PresentationQrFlipButton
            numericUserId={numericUserId}
            mediaKind="video"
            mediaId={videoId}
            enabled
            position={qrOverlayPosition}
            logoUrl={creatorLogoUrl}
            elevateAboveBottomControls
          />
        )}

        {verificationStatus === "verifying" && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white sm:top-4 sm:left-4">
            <LoadingSpinner size="sm" /> Verifying…
          </div>
        )}

        {isVerificationFailed && !embed && (
          <div className="absolute bottom-14 left-2 right-2 z-20 rounded-md bg-amber-600/90 px-3 py-2 text-xs text-white sm:bottom-16 sm:left-4 sm:right-4">
            <div className="font-medium">Watermark verification failed</div>
            <div className="opacity-90">This video could not be verified as authentic.</div>
          </div>
        )}
      </div>
    </div>
  );
}
