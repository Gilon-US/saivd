/**
 * ImageBitmap decode helpers for watermark verification.
 * Does not change the watermark algorithm — only how browsers materialize pixels
 * (avoid Safari/iOS color-management mutating the B channel).
 */

export type BitmapDecodeVariant = "legacy" | "strict";

/** Options aligned with lossless PNG verify (no color management). */
export function strictCreateImageBitmapOptions(): ImageBitmapOptions {
  return {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
    imageOrientation: "none",
  };
}

export async function decodeBitmapFromBlob(
  blob: Blob,
  variant: BitmapDecodeVariant = "strict",
): Promise<ImageBitmap> {
  if (variant === "legacy") {
    return createImageBitmap(blob);
  }
  try {
    return await createImageBitmap(blob, strictCreateImageBitmapOptions());
  } catch {
    // Older engines may reject ImageBitmapOptions; fall back without changing algorithm.
    return createImageBitmap(blob);
  }
}

export async function decodeBitmapFromImg(
  img: HTMLImageElement,
  variant: BitmapDecodeVariant = "strict",
): Promise<ImageBitmap> {
  if (typeof img.decode === "function") {
    await img.decode();
  }
  if (variant === "legacy") {
    return createImageBitmap(img);
  }
  try {
    return await createImageBitmap(img, strictCreateImageBitmapOptions());
  } catch {
    return createImageBitmap(img);
  }
}

/** 2D context settings that keep getImageData in sRGB byte space when supported. */
export function getWatermarkCanvas2dContext(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  const options = {colorSpace: "srgb", willReadFrequently: true} as CanvasRenderingContext2DSettings;
  try {
    const ctx = canvas.getContext("2d", options);
    if (ctx) return ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  } catch {
    /* fall through */
  }
  return canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}
