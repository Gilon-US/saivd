"use client";

import {useEffect, useState} from "react";
import {
  DEFAULT_QR_OVERLAY_POSITION,
  parseQrOverlayPosition,
  type QrOverlayPosition,
} from "@/lib/presentation-qr/position";

/**
 * Loads a creator's QR overlay corner from the public profile API.
 */
export function usePublicQrOverlayPosition(numericUserId: number | null): QrOverlayPosition {
  const [position, setPosition] = useState<QrOverlayPosition>(DEFAULT_QR_OVERLAY_POSITION);

  useEffect(() => {
    if (numericUserId === null) {
      setPosition(DEFAULT_QR_OVERLAY_POSITION);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/profile/${numericUserId}`, {credentials: "omit"});
        const body = await res.json().catch(() => null);
        if (cancelled || !res.ok || !body?.success) return;
        setPosition(parseQrOverlayPosition(body.data?.qr_overlay_position));
      } catch {
        /* keep default position */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [numericUserId]);

  return position;
}
