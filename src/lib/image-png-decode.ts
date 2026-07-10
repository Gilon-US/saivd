import * as UPNG from "upng-js";

/**
 * Lossless PNG → 8-bit RGBA without browser color management.
 * Used on iOS WebKit only so B-channel watermark bytes stay intact.
 */
export function decodeRgbaFromPngBuffer(buf: ArrayBuffer): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  const img = UPNG.decode(buf);
  const frames = UPNG.toRGBA8(img);
  if (!frames?.length) {
    throw new Error("upng_decode_failed: no frames");
  }
  return {
    width: img.width,
    height: img.height,
    rgba: new Uint8Array(frames[0]),
  };
}
