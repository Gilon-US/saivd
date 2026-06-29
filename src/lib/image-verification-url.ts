/**
 * Same-origin URLs for image bytes from Wasabi (avoids CORS on presigned URLs).
 */
export function imageOriginalDownloadUrl(imageId: string): string {
  return `/api/images/${imageId}/original`;
}

/** Pre-watermark sRGB standardization preview (fair compare vs watermarked PNG). */
export function imageStandardizedPreviewUrl(imageId: string, conversionRevision?: string): string {
  const base = `/api/images/${imageId}/standardized-preview`;
  if (!conversionRevision) return base;
  return `${base}?rev=${encodeURIComponent(conversionRevision)}`;
}

/** Watermarked PNG bytes — verifier, lightbox, and watermarked download. */
export function imageProcessedVerificationUrl(imageId: string): string {
  return `/api/images/${imageId}/processed`;
}

/** Public pages (/i, /embed/i) — anonymous same-origin processed bytes for verification. */
export function publicImageProcessedVerificationUrl(imageId: string): string {
  return `/api/public/images/${encodeURIComponent(imageId)}/processed`;
}

export function imageProcessedDownloadUrl(imageId: string): string {
  return imageProcessedVerificationUrl(imageId);
}
