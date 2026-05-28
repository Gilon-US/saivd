/**
 * Tests for in-browser image watermark verification (IMAGE_WATERMARK_SPEC §6).
 */

import {webcrypto} from "crypto";

if (typeof globalThis.crypto?.subtle === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

if (typeof TextEncoder === "undefined") {
  (global as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = class {
    encode(s: string): Uint8Array {
      const u8 = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      return u8;
    }
  };
}

import {
  decodeNumericUserIdFromImage,
  importRsaPublicKeyForVerify,
  verifyImageWatermark,
} from "../image-watermark-verification";
import {imageProcessedVerificationUrl} from "../image-verification-url";

const RSA_LEN = 256;
const USER_ID_DIGITS = 9;

let originalOffscreen: typeof OffscreenCanvas | undefined;
let createElementSpy: jest.SpyInstance | null = null;

/** One blue pixel per row so row sum mod width equals rowSums[y]. */
function buildRowBlueSums(width: number, height: number, rowSums: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const target = rowSums[y] ?? 0;
    data[y * width * 4 + 2] = target % width;
  }
  return data;
}

function installCanvasMock(data: Uint8ClampedArray, width: number, height: number) {
  const imageData = {data, width, height};
  const ctx = {
    drawImage: jest.fn(),
    getImageData: jest.fn(() => imageData),
  };
  const canvas = {
    width,
    height,
    getContext: jest.fn(() => ctx),
  };

  originalOffscreen = global.OffscreenCanvas;
  (global as unknown as {OffscreenCanvas: typeof OffscreenCanvas}).OffscreenCanvas = class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return ctx;
    }
  } as unknown as typeof OffscreenCanvas;

  createElementSpy = jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") return canvas as unknown as HTMLCanvasElement;
    return document.createElement.bind(document)(tag);
  });
}

function restoreCanvasMock() {
  if (createElementSpy) {
    createElementSpy.mockRestore();
    createElementSpy = null;
  }
  if (originalOffscreen !== undefined) {
    (global as unknown as {OffscreenCanvas: typeof OffscreenCanvas | undefined}).OffscreenCanvas =
      originalOffscreen;
    originalOffscreen = undefined;
  }
}

function mockImageBitmap(width: number, height: number, rowSums: number[]): ImageBitmap {
  const data = buildRowBlueSums(width, height, rowSums);
  installCanvasMock(data, width, height);
  return {width, height, close: jest.fn()} as unknown as ImageBitmap;
}

function buildWatermarkedRowSums(
  numericUserId: number,
  messageCells: number[],
  signatureBytes: Uint8Array,
): {width: number; height: number; rowSums: number[]} {
  const width = RSA_LEN;
  const height = RSA_LEN * 2;
  const rightLen = height - RSA_LEN;
  const digits = String(numericUserId).padStart(USER_ID_DIGITS, "0").split("").map(Number);
  const rightSide: number[] = [...digits];
  while (rightSide.length < messageCells.length) {
    rightSide.push(messageCells[rightSide.length] ?? 65);
  }
  while (rightSide.length < rightLen) {
    rightSide.push(65);
  }
  const leftSide = Array.from(signatureBytes.slice(0, RSA_LEN));
  while (leftSide.length < RSA_LEN) leftSide.push(0);
  return {width, height, rowSums: [...rightSide, ...leftSide]};
}

describe("image-verification-url", () => {
  it("builds same-origin processed URL", () => {
    expect(imageProcessedVerificationUrl("abc-123")).toBe("/api/images/abc-123/processed");
  });
});

describe("image-watermark-verification", () => {
  afterEach(() => {
    restoreCanvasMock();
  });

  describe("decodeNumericUserIdFromImage", () => {
    it("decodes 9-digit numeric user id from row sums", () => {
      const {width, height, rowSums} = buildWatermarkedRowSums(
        314159265,
        new Array(100).fill(65),
        new Uint8Array(RSA_LEN),
      );
      const bmp = mockImageBitmap(width, height, rowSums);
      expect(decodeNumericUserIdFromImage(bmp)).toBe(314159265);
    });

    it("returns null when digits are out of range", () => {
      const width = RSA_LEN;
      const height = RSA_LEN * 2;
      const bmp = mockImageBitmap(width, height, new Array(height).fill(12));
      expect(decodeNumericUserIdFromImage(bmp)).toBeNull();
    });

    it("returns null when image is too small", () => {
      const bmp = mockImageBitmap(100, 100, []);
      expect(decodeNumericUserIdFromImage(bmp)).toBeNull();
    });
  });

  describe("importRsaPublicKeyForVerify", () => {
    it("imports a PEM public key for verify", async () => {
      const pair = await crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
      );
      const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
      const b64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
      const pem = `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;
      const imported = await importRsaPublicKeyForVerify(pem);
      expect(imported.type).toBe("public");
      expect(imported.algorithm.name).toBe("RSASSA-PKCS1-v1_5");
    });
  });

  describe("verifyImageWatermark", () => {
    it("returns verified numeric user id when RSA signature matches", async () => {
      const numericUserId = 314159265;
      const pair = await crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
      );

      const messageCells = Array.from({length: 100}, (_, i) => 65 + (i % 26));
      const draft = buildWatermarkedRowSums(numericUserId, messageCells, new Uint8Array(RSA_LEN));
      const messageStr = String.fromCharCode(...draft.rowSums.slice(0, 100));
      const messageBuf = new TextEncoder().encode(messageStr);
      const signatureBuf = await crypto.subtle.sign({name: "RSASSA-PKCS1-v1_5"}, pair.privateKey, messageBuf);
      const signatureBytes = new Uint8Array(signatureBuf);

      const signed = buildWatermarkedRowSums(numericUserId, messageCells, signatureBytes);
      const bmp = mockImageBitmap(signed.width, signed.height, signed.rowSums);

      const result = await verifyImageWatermark(bmp, {publicKey: pair.publicKey});
      expect(result).toEqual({ok: true, numericUserId});
    });

    it("returns invalid_signature when RSA verify fails", async () => {
      const numericUserId = 123456789;
      const pair = await crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
      );

      const messageCells = new Array(100).fill(70);
      const badSignature = new Uint8Array(RSA_LEN);
      badSignature.fill(99);

      const {width, height, rowSums} = buildWatermarkedRowSums(numericUserId, messageCells, badSignature);
      const bmp = mockImageBitmap(width, height, rowSums);

      const result = await verifyImageWatermark(bmp, {publicKey: pair.publicKey});
      expect(result).toEqual({ok: false, reason: "invalid_signature"});
    });

    it("returns no_watermark when digits are invalid", async () => {
      const width = RSA_LEN;
      const height = RSA_LEN * 2;
      const bmp = mockImageBitmap(width, height, new Array(height).fill(15));
      const result = await verifyImageWatermark(bmp);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("no_watermark");
    });
  });
});
