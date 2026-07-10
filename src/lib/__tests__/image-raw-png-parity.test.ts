/**
 * Canvas vs raw RGBA row-sum parity + golden PNG digit decode.
 */

import fs from "fs";
import path from "path";
import {webcrypto} from "crypto";

if (typeof globalThis.crypto?.subtle === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

import {
  blueRowSumsFromRgba,
  imageBitmapToBlueRowSums,
  verifyImageRegions,
} from "../image-watermark-verification";
import {decodeRgbaFromPngBuffer} from "../image-png-decode";

const RSA_LEN = 256;
const USER_ID_DIGITS = 9;

function buildRowBlueSums(width: number, height: number, rowSums: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const target = rowSums[y] ?? 0;
    data[y * width * 4 + 2] = target % width;
  }
  return data;
}

describe("blueRowSumsFromRgba parity", () => {
  it("matches canvas path row sums and numericUserId on synthetic RGBA", () => {
    const width = RSA_LEN;
    const height = RSA_LEN + USER_ID_DIGITS + 10;
    const rowSums = new Array(height).fill(0);
    const digits = "000000018".split("").map(Number);
    for (let i = 0; i < digits.length; i++) rowSums[i] = digits[i];

    const rgba = buildRowBlueSums(width, height, rowSums);
    const fromRaw = blueRowSumsFromRgba(width, height, rgba);
    expect("error" in fromRaw).toBe(false);
    if ("error" in fromRaw) return;

    const imageData = {data: rgba, width, height};
    const ctx = {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => imageData),
    };
    (global as unknown as {OffscreenCanvas: unknown}).OffscreenCanvas = class {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return ctx;
      }
    };

    const bmp = {width, height, close: jest.fn()} as unknown as ImageBitmap;
    const fromCanvas = imageBitmapToBlueRowSums(bmp);
    expect("error" in fromCanvas).toBe(false);
    if ("error" in fromCanvas) return;

    expect(Array.from(fromRaw.rightSide)).toEqual(Array.from(fromCanvas.rightSide));
    expect(Array.from(fromRaw.leftSide)).toEqual(Array.from(fromCanvas.leftSide));

    const idRaw = parseInt(Array.from(fromRaw.rightSide.subarray(0, USER_ID_DIGITS)).join(""), 10);
    const idCanvas = parseInt(Array.from(fromCanvas.rightSide.subarray(0, USER_ID_DIGITS)).join(""), 10);
    expect(idRaw).toBe(18);
    expect(idCanvas).toBe(18);
  });
});

describe("golden watermarked PNG (raw path)", () => {
  const fixture = path.join(__dirname, "fixtures", "watermarked-b943d0d2.png");

  it("decodes numeric_user_id 18 from committed processed.png via upng", () => {
    if (!fs.existsSync(fixture)) {
      console.warn("skip: missing golden fixture");
      return;
    }
    const file = fs.readFileSync(fixture);
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const {width, height, rgba} = decodeRgbaFromPngBuffer(buf);
    expect(width).toBe(1350);
    expect(height).toBe(500);
    const regions = blueRowSumsFromRgba(width, height, rgba);
    expect("error" in regions).toBe(false);
    if ("error" in regions) return;
    const digits = Array.from(regions.rightSide.subarray(0, USER_ID_DIGITS));
    expect(digits.every((d) => d >= 0 && d <= 9)).toBe(true);
    expect(parseInt(digits.join(""), 10)).toBe(18);
  });

  it("RSA-verifies golden fixture when public key is available", async () => {
    if (!fs.existsSync(fixture)) return;
    const file = fs.readFileSync(fixture);
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const {width, height, rgba} = decodeRgbaFromPngBuffer(buf);
    const regions = blueRowSumsFromRgba(width, height, rgba);
    if ("error" in regions) throw new Error(regions.error);

    let pem: string | undefined;
    try {
      const res = await fetch("https://creator.saivd.io/api/users/18/public-key");
      if (!res.ok) {
        console.warn("skip: public key fetch failed", res.status);
        return;
      }
      const json = (await res.json()) as {data?: {public_key_pem?: string}};
      pem = json.data?.public_key_pem;
    } catch {
      console.warn("skip: public key network unavailable");
      return;
    }
    if (!pem) return;

    const {importRsaPublicKeyForVerify} = await import("../image-watermark-verification");
    const publicKey = await importRsaPublicKeyForVerify(pem);
    const result = await verifyImageRegions(regions, {publicKey});
    expect(result).toEqual({ok: true, numericUserId: 18});
  });
});
