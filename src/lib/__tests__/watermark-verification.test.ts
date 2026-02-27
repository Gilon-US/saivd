/**
 * Tests for client-side watermark verification (decode + RSA verify) per FRONTEND_WATERMARK_VERIFICATION_SPEC.md.
 */

/* Polyfill for Jest (jsdom may not define ImageData / TextEncoder) */
if (typeof ImageData === "undefined") {
  (global as unknown as { ImageData: typeof ImageData }).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight?: number, height?: number) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth;
        this.height = widthOrHeight ?? 0;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight ?? 0;
        this.height = height ?? 0;
      }
    }
  } as unknown as typeof ImageData;
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
if (typeof TextDecoder === "undefined") {
  (global as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = class {
    decode(b: Uint8Array): string {
      return String.fromCharCode(...b);
    }
  };
}

import {
  PATCH_SIZE,
  MAX_MESSAGE_LENGTH,
  SIGNATURE_LENGTH,
  USER_ID_DIGITS,
  REPS,
  cropToMultipleOf16,
  buildPatchMatrix,
  getRightEndIndex,
  getRightSideRowSums,
  decodeNumericUserIdFromRightSide,
  getLeftSideSignature,
  buildMessageBytes,
} from "../watermark-verification";

describe("watermark-verification", () => {
  describe("constants", () => {
    it("exports spec constants", () => {
      expect(PATCH_SIZE).toBe(16);
      expect(MAX_MESSAGE_LENGTH).toBe(100);
      expect(SIGNATURE_LENGTH).toBe(256);
      expect(USER_ID_DIGITS).toBe(9);
      expect(REPS).toBe(7);
    });
  });

  describe("cropToMultipleOf16", () => {
    it("crops width and height to multiples of 16", () => {
      const width = 100;
      const height = 50;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        data[i * 4] = 128;
        data[i * 4 + 1] = 128;
        data[i * 4 + 2] = 128;
        data[i * 4 + 3] = 255;
      }
      const imageData = new ImageData(data, width, height) as ImageData;
      const result = cropToMultipleOf16(imageData);
      expect(result.width).toBe(96); // 100 - 4
      expect(result.height).toBe(48); // 50 - 2
      expect(result.luma.length).toBe(96 * 48);
    });

    it("returns empty when dimensions are too small", () => {
      const imageData = new ImageData(10, 10) as ImageData;
      const result = cropToMultipleOf16(imageData);
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
      expect(result.luma.length).toBe(0);
    });
  });

  describe("buildPatchMatrix", () => {
    it("builds (H/16 x W/16) matrix with rounded block means", () => {
      const w = 32;
      const h = 32;
      const luma = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) luma[i] = 100;
      const matrix = buildPatchMatrix(luma, w, h);
      expect(matrix.length).toBe(2);
      expect(matrix[0].length).toBe(2);
      expect(matrix[0][0]).toBe(100);
    });
  });

  describe("getRightEndIndex", () => {
    it("returns patchCols - numLeftColumns using pixel height", () => {
      const pixelHeight = 704; // 44 patch rows
      const patchCols = 80;
      const idx = getRightEndIndex(pixelHeight, patchCols);
      const groupsPerColumn = Math.floor(pixelHeight / 5); // 140
      const numLeftColumns = Math.ceil(SIGNATURE_LENGTH / groupsPerColumn); // ceil(256/140)=2
      expect(idx).toBe(patchCols - numLeftColumns); // 78
    });

    it("returns 0 when pixel height too small for 5-pixel groups", () => {
      expect(getRightEndIndex(2, 50)).toBe(0);
    });
  });

  describe("getRightSideRowSums", () => {
    it("sums each row horizontally then applies modulo rightEndIndex", () => {
      const givenFrame = [
        [1, 2, 3],
        [4, 5, 6],
      ];
      // rightEndIndex=2: sum cols 0..1 per row, then % 2
      const rightSide = getRightSideRowSums(givenFrame, 2);
      // row 0: (1+2) % 2 = 1, row 1: (4+5) % 2 = 1
      expect(rightSide).toEqual([1, 1]);
    });

    it("correctly applies modulo with larger values", () => {
      const givenFrame = [
        [50, 30, 99],
        [10, 20, 99],
      ];
      // rightEndIndex=3: sum all 3 cols per row, then % 3
      const rightSide = getRightSideRowSums(givenFrame, 3);
      // row 0: (50+30+99) % 3 = 179 % 3 = 2
      // row 1: (10+20+99) % 3 = 129 % 3 = 0
      expect(rightSide).toEqual([2, 0]);
    });
  });

  describe("decodeNumericUserIdFromRightSide", () => {
    it("decodes 9 digits from 63 values (groups of 7, mode)", () => {
      const rightSide: number[] = [];
      for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        for (let r = 0; r < REPS; r++) rightSide.push(d);
      }
      while (rightSide.length < 100) rightSide.push(0);
      const id = decodeNumericUserIdFromRightSide(rightSide);
      expect(id).toBe(123456789);
    });

    it("decodes fewer digits for shorter frames (e.g. 44 rows → 6 digits)", () => {
      // 44 values, trimmed to 42 → 6 groups → 6 digits
      const rightSide: number[] = [];
      for (const d of [5, 3, 0, 0, 0, 0]) {
        for (let r = 0; r < REPS; r++) rightSide.push(d);
      }
      rightSide.push(9); rightSide.push(9); // 2 extra (trimmed)
      const id = decodeNumericUserIdFromRightSide(rightSide);
      // "530000" → rstrip('0') → "53"
      expect(id).toBe(53);
    });

    it("returns null when no usable groups (< 7 values)", () => {
      expect(decodeNumericUserIdFromRightSide([1, 2, 3])).toBeNull();
    });

    it("returns null when mode yields invalid digit (> 9)", () => {
      const rightSide = new Array(63).fill(255);
      expect(decodeNumericUserIdFromRightSide(rightSide)).toBeNull();
    });
  });

  describe("getLeftSideSignature", () => {
    it("returns 256 bytes from 5-pixel groups column-major", () => {
      const width = 80; // e.g. rightEndIndex=5 -> leftStartCol=80
      const height = 100;
      const luma = new Uint8Array(width * height);
      for (let i = 0; i < luma.length; i++) luma[i] = 1;
      const rightEndIndex = 4; // left region starts at column 64
      const sig = getLeftSideSignature(luma, width, height, rightEndIndex);
      expect(sig.length).toBe(SIGNATURE_LENGTH);
      // Each 5-pixel group sum = 5, clamped to 255
      expect(sig[0]).toBe(5);
    });
  });

  describe("buildMessageBytes", () => {
    it("builds UTF-8 message from first 100 right_side code points", () => {
      const rightSide = [65, 66, 67]; // "ABC"
      const bytes = buildMessageBytes(rightSide);
      expect(new TextDecoder().decode(bytes)).toBe("ABC");
    });

    it("caps at MAX_MESSAGE_LENGTH", () => {
      const rightSide = new Array(150).fill(65);
      const bytes = buildMessageBytes(rightSide);
      expect(bytes.length).toBe(100);
    });
  });
});
