/** Token valid for 4 minutes; rotate every 3 → 1 minute overlap. */
export const PRESENTATION_QR_TTL_SECONDS = 240;

export const PRESENTATION_QR_ROTATE_MS = 180_000;

export function isPresentationQrEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PRESENTATION_QR_ENABLED === "1";
}

export function getCreatorAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_APP_URL;
  if (!fromEnv) {
    throw new Error("App base URL is not configured. Set NEXT_PUBLIC_SITE_URL or PUBLIC_APP_URL.");
  }
  return fromEnv.replace(/\/+$/, "");
}
