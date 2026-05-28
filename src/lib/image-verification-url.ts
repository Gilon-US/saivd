/**
 * Same-origin URL for watermarked PNG bytes (GET /api/images/[id]/processed).
 * Used by the lightbox display and in-browser verifier — avoids CORS on
 * presigned Wasabi URLs when reading pixels via fetch/createImageBitmap.
 */
export function imageProcessedVerificationUrl(imageId: string): string {
  return `/api/images/${imageId}/processed`;
}
