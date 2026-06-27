/**
 * Same-origin URLs for image bytes from Wasabi (avoids CORS on presigned URLs).
 */
export function imageOriginalDownloadUrl(imageId: string): string {
  return `/api/images/${imageId}/original`;
}

/** Pre-watermark sRGB standardization preview (fair compare vs watermarked PNG). */
export function imageStandardizedPreviewUrl(imageId: string): string {
  return `/api/images/${imageId}/standardized-preview`;
}

/** Watermarked PNG bytes — verifier, lightbox, and watermarked download. */
export function imageProcessedVerificationUrl(imageId: string): string {
  return `/api/images/${imageId}/processed`;
}

export function imageProcessedDownloadUrl(imageId: string): string {
  return imageProcessedVerificationUrl(imageId);
}
