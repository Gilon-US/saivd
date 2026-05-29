"use client";

import {usePresentationQr, type PresentationMediaKind} from "@/hooks/usePresentationQr";
import {
  DEFAULT_QR_OVERLAY_POSITION,
  getQrOverlayPositionClasses,
  type QrOverlayPosition,
} from "@/lib/presentation-qr/position";
import {cn} from "@/lib/utils";

const CREATOR_APP_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  process.env.PUBLIC_APP_URL?.replace(/\/+$/, "") ??
  "";

type PresentationQrFlipButtonProps = {
  numericUserId: number;
  mediaKind: PresentationMediaKind;
  mediaId: string;
  enabled: boolean;
  position?: QrOverlayPosition;
  /** Lift bottom corners above video control bar */
  elevateAboveBottomControls?: boolean;
  className?: string;
  mintEndpoint?: string;
  profileOrigin?: string;
};

/** QR ↔ logo flip overlay with dynamic presentation QR (3 min rotate, 4 min TTL). */
export function PresentationQrFlipButton({
  numericUserId,
  mediaKind,
  mediaId,
  enabled,
  position = DEFAULT_QR_OVERLAY_POSITION,
  elevateAboveBottomControls = false,
  className = "",
  mintEndpoint = "/api/presentation/mint",
  profileOrigin = CREATOR_APP_ORIGIN,
}: PresentationQrFlipButtonProps) {
  const {qrDataUrl, scanUrl, isDynamic, staticQrUrl} = usePresentationQr({
    enabled,
    numericUserId,
    mediaKind,
    mediaId,
    mintEndpoint,
  });

  const profileUrl = `${profileOrigin}/profile/${numericUserId}`;
  const qrImageSrc = isDynamic && qrDataUrl ? qrDataUrl : staticQrUrl;

  if (!qrImageSrc) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const target = isDynamic && scanUrl ? scanUrl : profileUrl;
        window.open(target, "_blank", "noopener,noreferrer");
      }}
      aria-label="View creator profile"
      className={cn(
        "absolute z-20 qr-logo-flip-container cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded-md",
        getQrOverlayPositionClasses(position, {elevateAboveBottomControls}),
        className,
      )}>
      <div className="qr-logo-flip-card">
        <div className="qr-logo-flip-face qr-logo-flip-face-front">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageSrc}
            alt="Creator QR code"
            className="w-16 h-16 object-contain rounded-md shadow-md"
          />
        </div>
        <div className="qr-logo-flip-face qr-logo-flip-face-back">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/saivd-logo.png"
            alt="Brand logo"
            className="w-16 h-16 object-contain rounded-md shadow-md"
          />
        </div>
      </div>
    </button>
  );
}
