import {decodeNumericUserIdFromRightSide} from "../watermark-verification";

/**
 * Row sums are taken mod rightEndIndex (the backend's payload_end), so the calibration shift must be
 * searched mod the same number. Build a payload whose shift wraps past payload_end.
 */
function shiftedRightSide(userId: string, payloadEnd: number, shift: number, reps: number): number[] {
  const digits = [0, 5, 9, 0, 5, 9, ...userId.split("").map(Number)];
  const out: number[] = [];
  for (const d of digits) for (let r = 0; r < reps; r++) out.push((d + shift) % payloadEnd);
  return out;
}

describe("v2 Y decoder shift-search modulus", () => {
  // shift 45 with payload_end 50: 5 -> 0 and 9 -> 4 wrap, and the largest observed value is 47, so the
  // legacy estimate max(values) + 1 = 48 is the wrong modulus.
  const rightSide = shiftedRightSide("121212121", 50, 45, 2);

  it("decodes with the backend modulus (rightEndIndex)", () => {
    expect(Math.max(...rightSide)).toBe(47);
    expect(decodeNumericUserIdFromRightSide(rightSide, 50)).toBe(121212121);
  });

  it("legacy estimate (no modulus) cannot recover a wrapped shift", () => {
    expect(decodeNumericUserIdFromRightSide(rightSide)).not.toBe(121212121);
  });

  it("is unchanged when nothing wraps", () => {
    const plain = shiftedRightSide("000123456", 50, 0, 3);
    expect(decodeNumericUserIdFromRightSide(plain, 50)).toBe(123456);
    expect(decodeNumericUserIdFromRightSide(plain)).toBe(123456);
  });
});
