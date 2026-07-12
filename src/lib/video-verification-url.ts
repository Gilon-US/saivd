/**
 * Same-origin URLs for public video bytes (Range-friendly WASM verification).
 */
export function publicVideoWatermarkedStreamUrl(videoId: string): string {
  return `/api/public/videos/${encodeURIComponent(videoId)}/watermarked`;
}
