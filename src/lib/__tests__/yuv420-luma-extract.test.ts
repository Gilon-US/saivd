import {extractYLumaFromYuv420pRaw} from "../yuv420-luma-extract";

describe("extractYLumaFromYuv420pRaw", () => {
  it("unpacks Y with 32-byte stride (1080×1920-style)", () => {
    const width = 1080;
    const height = 1920;
    const lsY = 1088;
    const lsUV = 544;
    const chromaRows = height / 2;
    const total = lsY * height + 2 * lsUV * chromaRows;
    const buf = new Uint8Array(total);
    for (let row = 0; row < height; row++) {
      for (let x = 0; x < lsY; x++) {
        buf[row * lsY + x] = x < width ? (row + x) & 0xff : 0;
      }
    }

    const y = extractYLumaFromYuv420pRaw(buf, width, height);
    expect(y.length).toBe(width * height);
    expect(y[0]).toBe(0);
    expect(y[width]).toBe(1);
    expect(y[width + 1]).toBe(2);
  });

  it("unpacks tight 1.5× layout when ls = width (no padding)", () => {
    const width = 64;
    const height = 64;
    const ls = 64;
    const total = (ls * height * 3) / 2;
    const buf = new Uint8Array(total);
    for (let i = 0; i < total; i++) buf[i] = i % 256;

    const y = extractYLumaFromYuv420pRaw(buf, width, height);
    expect(y.length).toBe(width * height);
    expect(y[0]).toBe(buf[0]);
    expect(y[width]).toBe(buf[ls]);
  });

  it("throws on empty buffer", () => {
    expect(() => extractYLumaFromYuv420pRaw(new Uint8Array(0), 64, 64)).toThrow(/empty/);
  });
});
