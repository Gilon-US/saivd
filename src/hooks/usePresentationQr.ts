"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import QRCode from "qrcode";
import {
  PRESENTATION_QR_ROTATE_MS,
  getCreatorAppOriginOrFallback,
  isPresentationQrEnabled,
} from "@/lib/presentation-qr/constants";

export type PresentationMediaKind = "video" | "image";

type UsePresentationQrOptions = {
  enabled: boolean;
  numericUserId: number | null;
  mediaKind: PresentationMediaKind;
  mediaId: string | null;
  mintEndpoint?: string;
};

type UsePresentationQrResult = {
  qrDataUrl: string | null;
  scanUrl: string | null;
  isDynamic: boolean;
  /** Static fallback URL for legacy profile QR PNG */
  staticQrUrl: string | null;
};

export function usePresentationQr({
  enabled,
  numericUserId,
  mediaKind,
  mediaId,
  mintEndpoint = "/api/presentation/mint",
}: UsePresentationQrOptions): UsePresentationQrResult {
  const dynamicEnabled = isPresentationQrEnabled();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const creatorOrigin = getCreatorAppOriginOrFallback();
  const staticQrUrl =
    numericUserId !== null ? `${creatorOrigin}/profile/${numericUserId}/qr` : null;

  const mint = useCallback(async () => {
    if (!dynamicEnabled || !enabled || numericUserId === null || !mediaId || inflightRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;

    inflightRef.current = true;
    try {
      const res = await fetch(mintEndpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({numericUserId, mediaKind, mediaId}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success || !body?.data?.scanUrl) return;

      const nextScanUrl = body.data.scanUrl as string;
      const dataUrl = await QRCode.toDataURL(nextScanUrl, {margin: 1, width: 256});
      setScanUrl(nextScanUrl);
      setQrDataUrl(dataUrl);
    } catch {
      /* keep previous QR until next rotation */
    } finally {
      inflightRef.current = false;
    }
  }, [dynamicEnabled, enabled, numericUserId, mediaKind, mediaId, mintEndpoint]);

  useEffect(() => {
    if (!dynamicEnabled || numericUserId === null || !mediaId) {
      setQrDataUrl(null);
      setScanUrl(null);
      return;
    }

    if (!enabled) {
      // Pause mint/rotation but keep the last dynamic QR visible (e.g. video paused).
      return;
    }

    void mint();
    const intervalId = window.setInterval(() => void mint(), PRESENTATION_QR_ROTATE_MS);
    const onVisibility = () => {
      if (!document.hidden) void mint();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dynamicEnabled, enabled, numericUserId, mediaId, mint]);

  return {
    qrDataUrl,
    scanUrl,
    isDynamic: dynamicEnabled,
    staticQrUrl,
  };
}
