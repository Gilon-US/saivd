/**
 * Strip s3://bucket/ prefix from external watermark API paths so we store a key usable with Wasabi.
 */
export function normalizeWatermarkPath(path: string): string {
  const match = path.match(/^s3:\/\/[^/]+\/(.+)$/);
  if (!match) return path;
  return match[1];
}
