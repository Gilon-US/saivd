/**
 * Extract packed row-major Y luma from FFmpeg `rawvideo` + `yuv420p` output.
 *
 * FFmpeg stores planar Y with **linesize ≥ width** (typically 32-byte aligned), then U and V.
 * Taking `buf.slice(0, width*height)` is wrong — it reads misaligned rows and bleeds into U/V.
 *
 * Layout (8-bit 420p): Y = lsY * height, then U = lsUV * (height/2), V = lsUV * (height/2).
 * Total = height * (lsY + lsUV). Strides match FFmpeg's FFALIGN defaults.
 */

function alignUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

/**
 * @param full - Full rawvideo buffer from ffmpeg `-f rawvideo -pix_fmt yuv420p`
 * @param width - Frame width (pixels)
 * @param height - Frame height (pixels)
 * @returns Tight width×height Y plane, row-major
 */
export function extractYLumaFromYuv420pRaw(
  full: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const total = full.length;
  if (total === 0) {
    throw new Error("yuv420p buffer is empty (ffmpeg produced no output)");
  }

  const chromaRows = Math.ceil(height / 2);

  type Pair = {lsY: number; lsUV: number};
  const tryPairs: Pair[] = [];
  for (const align of [32, 16, 64, 8]) {
    tryPairs.push({
      lsY: alignUp(width, align),
      lsUV: alignUp(Math.ceil(width / 2), align),
    });
  }
  const seen = new Set<string>();
  for (const p of tryPairs) {
    const key = `${p.lsY}:${p.lsUV}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const expected = p.lsY * height + 2 * p.lsUV * chromaRows;
    if (expected === total) {
      return copyYRows(full, width, height, p.lsY);
    }
  }

  // Scan lsY near width (FFmpeg may use different alignment on some builds)
  for (let lsY = width; lsY <= width + 128; lsY++) {
    for (const align of [32, 16, 8]) {
      const lsUV = alignUp(Math.ceil(width / 2), align);
      const expected = lsY * height + 2 * lsUV * chromaRows;
      if (expected === total) {
        return copyYRows(full, width, height, lsY);
      }
    }
  }

  // Classic 1.5× formula when UV stride = lsY/2 (tight packing)
  const ls = (2 * total) / (3 * height);
  if (Number.isInteger(ls) && ls >= width) {
    const expected = (ls * height * 3) / 2;
    if (expected === total) {
      return copyYRows(full, width, height, ls);
    }
  }

  throw new Error(
    `Cannot parse yuv420p raw buffer: len=${total}, w=${width}, h=${height} (expected one of common stride layouts)`
  );
}

function copyYRows(
  full: Uint8Array,
  width: number,
  height: number,
  lsY: number
): Uint8Array {
  const yPlane = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const src = row * lsY;
    yPlane.set(full.subarray(src, src + width), row * width);
  }
  return yPlane;
}
export type Yuv420pPlanes = {
  /** Packed Y, stride = width. */
  y: Uint8Array;
  /** Packed U, stride = ceil(width / 2). */
  u: Uint8Array;
  /** Packed V, stride = ceil(width / 2). */
  v: Uint8Array;
  width: number;
  height: number;
};

/**
 * Find the Y and U/V line sizes of an FFmpeg `rawvideo` yuv420p buffer. Packed (no padding) is tried
 * first, then the aligned layouts `extractYLumaFromYuv420pRaw` accepts.
 */
export function detectYuv420pStrides(
  total: number,
  width: number,
  height: number
): {lsY: number; lsUV: number} {
  const chromaWidth = Math.ceil(width / 2);
  const chromaRows = Math.ceil(height / 2);
  const fits = (lsY: number, lsUV: number) => lsY * height + 2 * lsUV * chromaRows === total;

  if (fits(width, chromaWidth)) return {lsY: width, lsUV: chromaWidth};
  for (const align of [32, 16, 64, 8]) {
    const lsY = alignUp(width, align);
    const lsUV = alignUp(chromaWidth, align);
    if (fits(lsY, lsUV)) return {lsY, lsUV};
  }
  for (let lsY = width; lsY <= width + 128; lsY++) {
    for (const align of [32, 16, 8]) {
      const lsUV = alignUp(chromaWidth, align);
      if (fits(lsY, lsUV)) return {lsY, lsUV};
    }
  }
  const ls = (2 * total) / (3 * height);
  if (Number.isInteger(ls) && ls >= width && ls % 2 === 0 && fits(ls, ls / 2)) {
    return {lsY: ls, lsUV: ls / 2};
  }
  throw new Error(
    `Cannot parse yuv420p raw buffer: len=${total}, w=${width}, h=${height} (expected one of common stride layouts)`
  );
}

/**
 * Extract packed Y, U and V planes from FFmpeg `rawvideo` + `yuv420p` output (row padding removed).
 * Used by watermark format v3, which reads all three planes.
 */
export function extractYuv420pPlanes(full: Uint8Array, width: number, height: number): Yuv420pPlanes {
  if (full.length === 0) {
    throw new Error("yuv420p buffer is empty (ffmpeg produced no output)");
  }
  const {lsY, lsUV} = detectYuv420pStrides(full.length, width, height);
  const chromaWidth = Math.ceil(width / 2);
  const chromaRows = Math.ceil(height / 2);
  const uOffset = lsY * height;
  const vOffset = uOffset + lsUV * chromaRows;
  return {
    y: copyYRows(full, width, height, lsY),
    u: copyPlaneRows(full, uOffset, chromaWidth, chromaRows, lsUV),
    v: copyPlaneRows(full, vOffset, chromaWidth, chromaRows, lsUV),
    width,
    height,
  };
}

function copyPlaneRows(
  full: Uint8Array,
  offset: number,
  width: number,
  rows: number,
  lineSize: number
): Uint8Array {
  const plane = new Uint8Array(width * rows);
  for (let row = 0; row < rows; row++) {
    const src = offset + row * lineSize;
    plane.set(full.subarray(src, src + width), row * width);
  }
  return plane;
}

