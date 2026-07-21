import {getCreatorAppPublicOrigin} from "@/lib/public-media-urls";

/** Token valid for 2 minutes; rotate every 90s → 30s overlap. */
export const PRESENTATION_QR_TTL_SECONDS = 120;

export const PRESENTATION_QR_ROTATE_MS = 90_000;

export function isPresentationQrEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PRESENTATION_QR_ENABLED !== "0";
}

export function getCreatorAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_APP_URL;
  if (!fromEnv) {
    throw new Error("App base URL is not configured. Set NEXT_PUBLIC_SITE_URL or PUBLIC_APP_URL.");
  }
  return fromEnv.replace(/\/+$/, "");
}

/** Client-safe creator origin for QR/profile links (env, then browser origin, then prod fallback). */
export function getCreatorAppOriginOrFallback(): string {
  return getCreatorAppPublicOrigin();
}
