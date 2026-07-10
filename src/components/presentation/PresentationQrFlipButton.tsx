"use client";

import {useEffect, useState} from "react";
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

const DEFAULT_LOGO_URL = "/images/saivd-logo.png";

function isDisplayableLogoUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/") || url.startsWith("blob:");
}

type PresentationQrFlipButtonProps = {
  numericUserId: number;
  mediaKind: PresentationMediaKind;
  mediaId: string;
  enabled: boolean;
  position?: QrOverlayPosition;
  /** Creator brand logo for the flip back face; falls back to SAIVD logo */
  logoUrl?: string | null;
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
  logoUrl = null,
  elevateAboveBottomControls = false,
  className = "",
  mintEndpoint = "/api/presentation/mint",
  profileOrigin = CREATOR_APP_ORIGIN,
}: PresentationQrFlipButtonProps) {
  const {qrDataUrl, isDynamic, staticQrUrl} = usePresentationQr({
    enabled,
    numericUserId,
    mediaKind,
    mediaId,
    mintEndpoint,
  });

  const preferredLogo = isDisplayableLogoUrl(logoUrl) ? logoUrl : DEFAULT_LOGO_URL;
  const [backLogoSrc, setBackLogoSrc] = useState(preferredLogo);

  useEffect(() => {
    setBackLogoSrc(preferredLogo);
  }, [preferredLogo]);

  const profileUrl = profileOrigin
    ? `${profileOrigin}/profile/${numericUserId}`
    : `/profile/${numericUserId}`;
  const qrImageSrc = isDynamic && qrDataUrl ? qrDataUrl : staticQrUrl;

  if (!qrImageSrc) return null;

  return (
    <button
      type="button"
      onClick={() => {
        // In-app click: always profile. QR image still encodes /p/… for camera scans.
        window.open(profileUrl, "_blank", "noopener,noreferrer");
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
            src={backLogoSrc}
            alt="Creator logo"
            className="w-16 h-16 object-cover rounded-md shadow-md"
            onError={() => {
              if (backLogoSrc !== DEFAULT_LOGO_URL) {
                setBackLogoSrc(DEFAULT_LOGO_URL);
              }
            }}
          />
        </div>
      </div>
    </button>
  );
}
