import {detectYuv420pStrides, extractYLumaFromYuv420pRaw, extractYuv420pPlanes} from "../yuv420-luma-extract";

/** Build an FFmpeg-style yuv420p buffer with the given line sizes; pixel value encodes plane/row/col. */
function buildRaw(width: number, height: number, lsY: number, lsUV: number) {
  const cw = Math.ceil(width / 2);
  const ch = Math.ceil(height / 2);
  const raw = new Uint8Array(lsY * height + 2 * lsUV * ch).fill(0xee); // padding bytes = 0xee
  const yv = (r: number, c: number) => (r * 7 + c * 3) % 200;
  const uv = (plane: number, r: number, c: number) => (plane * 50 + r * 5 + c) % 200;
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) raw[r * lsY + c] = yv(r, c);
  const uOff = lsY * height;
  const vOff = uOff + lsUV * ch;
  for (let r = 0; r < ch; r++) {
    for (let c = 0; c < cw; c++) {
      raw[uOff + r * lsUV + c] = uv(1, r, c);
      raw[vOff + r * lsUV + c] = uv(2, r, c);
    }
  }
  const expect = {
    y: Uint8Array.from({length: width * height}, (_, i) => yv(Math.floor(i / width), i % width)),
    u: Uint8Array.from({length: cw * ch}, (_, i) => uv(1, Math.floor(i / cw), i % cw)),
    v: Uint8Array.from({length: cw * ch}, (_, i) => uv(2, Math.floor(i / cw), i % cw)),
  };
  return {raw, expect};
}

describe("extractYuv420pPlanes", () => {
  it.each([
    ["packed 854x480", 854, 480, 854, 427],
    ["packed odd 853x481", 853, 481, 853, 427],
    ["32-aligned 854x480", 854, 480, 864, 448],
    ["packed 1920x1080", 1920, 1080, 1920, 960],
  ])("%s", (_label, width, height, lsY, lsUV) => {
    const {raw, expect: want} = buildRaw(width, height, lsY, lsUV);
    expect(detectYuv420pStrides(raw.length, width, height)).toEqual({lsY, lsUV});
    const planes = extractYuv420pPlanes(raw, width, height);
    expect(planes.y).toEqual(want.y);
    expect(planes.u).toEqual(want.u);
    expect(planes.v).toEqual(want.v);
  });

  it("returns the same Y plane as the legacy Y-only extractor", () => {
    const {raw} = buildRaw(854, 480, 864, 448);
    expect(extractYuv420pPlanes(raw, 854, 480).y).toEqual(extractYLumaFromYuv420pRaw(raw, 854, 480));
  });

  it("rejects buffers that match no layout", () => {
    expect(() => extractYuv420pPlanes(new Uint8Array(1234), 854, 480)).toThrow(/Cannot parse yuv420p/);
    expect(() => extractYuv420pPlanes(new Uint8Array(0), 854, 480)).toThrow(/empty/);
  });
});
