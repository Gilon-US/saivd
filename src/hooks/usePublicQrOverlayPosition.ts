"use client";

import {useEffect, useState} from "react";
import {
  DEFAULT_QR_OVERLAY_POSITION,
  parseQrOverlayPosition,
  type QrOverlayPosition,
} from "@/lib/presentation-qr/position";

export type PublicCreatorQrOverlay = {
  position: QrOverlayPosition;
  /** Resolved creator brand logo URL, if available */
  logoUrl: string | null;
};

/**
 * Loads a creator's QR overlay corner and brand logo from the public profile API.
 */
export function usePublicQrOverlayPosition(numericUserId: number | null): PublicCreatorQrOverlay {
  const [overlay, setOverlay] = useState<PublicCreatorQrOverlay>({
    position: DEFAULT_QR_OVERLAY_POSITION,
    logoUrl: null,
  });

  useEffect(() => {
    if (numericUserId === null) {
      setOverlay({position: DEFAULT_QR_OVERLAY_POSITION, logoUrl: null});
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/profile/${numericUserId}`, {credentials: "omit"});
        const body = await res.json().catch(() => null);
        if (cancelled || !res.ok || !body?.success) return;

        const logo = typeof body.data?.logo === "string" ? body.data.logo.trim() : "";
        setOverlay({
          position: parseQrOverlayPosition(body.data?.qr_overlay_position),
          logoUrl: logo || null,
        });
      } catch {
        /* keep default overlay */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [numericUserId]);

  return overlay;
}
