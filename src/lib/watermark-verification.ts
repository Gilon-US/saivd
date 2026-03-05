/**
 * Client-side watermark verification (decode + RSA verify) per docs/WATERMARK_DATA_AND_DECODING_GUIDE.md.
 * The guide was generated from the actual backend implementation and is the source of truth.
 * Decodes numeric_user_id from frame 0 (no key); the backend does not use the RSA key for the right
 * side on frame 0, so the user ID can be extracted without a key. Verifies frames 0, 10, 20, ...
 * using the creator's public RSA key.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debugLog(...args: any[]) {
  console.log("[WatermarkDecode]", ...args);
}

export const PATCH_SIZE = 16;
export const FACTOR = 1;
export const MAX_MESSAGE_LENGTH = 100;
export const SIGNATURE_LENGTH = 256;
export const USER_ID_DIGITS = 9;
export const REPS = 7;

/**
 * Extract luma (Y) from RGBA ImageData using limited-range BT.709.
 *
 * Backend watermarking uses Y from decoded video (typically limited range 16–235). We derive
 * Y from canvas RGB the same way: full-range BT.709 then map to limited range so patch
 * means match. Formula: Y_full = 0.2126*R + 0.7152*G + 0.0722*B; Y = 16 + (219/255)*Y_full.
 * See docs/FRONTEND_WATERMARK_VERIFICATION_FIX.md; use limited range if full-range fails.
 */
function imageDataToLuma(data: ImageData): Uint8Array {
  const {width, height, data: rgba} = data;
  const luma = new Uint8Array(width * height);
  const scale = 219 / 255;
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const yFull = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const yLimited = 16 + scale * yFull;
    luma[i] = Math.max(0, Math.min(255, Math.round(yLimited)));
  }
  return luma;
}

/** Crop frame to dimensions that are multiples of 16. Returns cropped luma and width/height. */
export function cropToMultipleOf16(
  imageData: ImageData
): {luma: Uint8Array; width: number; height: number} {
  const w = imageData.width - (imageData.width % PATCH_SIZE);
  const h = imageData.height - (imageData.height % PATCH_SIZE);
  debugLog("cropToMultipleOf16", {
    inputWidth: imageData.width,
    inputHeight: imageData.height,
    croppedWidth: w,
    croppedHeight: h,
  });
  if (w <= 0 || h <= 0) {
    debugLog("cropToMultipleOf16: dimensions too small, returning empty");
    return {luma: new Uint8Array(0), width: 0, height: 0};
  }
  const luma = imageDataToLuma(imageData);
  const cropped = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cropped[y * w + x] = luma[y * imageData.width + x];
    }
  }
  return {luma: cropped, width: w, height: h};
}

/**
 * Build patch matrix (H/16 x W/16). Each cell = mean of 16x16 block, rounded.
 */
export function buildPatchMatrix(luma: Uint8Array, width: number, height: number): number[][] {
  const rows = Math.floor(height / PATCH_SIZE);
  const cols = Math.floor(width / PATCH_SIZE);
  const matrix: number[][] = [];
  for (let py = 0; py < rows; py++) {
    const row: number[] = [];
    for (let px = 0; px < cols; px++) {
      let sum = 0;
      for (let dy = 0; dy < PATCH_SIZE; dy++) {
        for (let dx = 0; dx < PATCH_SIZE; dx++) {
          sum += luma[(py * PATCH_SIZE + dy) * width + (px * PATCH_SIZE + dx)];
        }
      }
      const mean = sum / (PATCH_SIZE * PATCH_SIZE);
      row.push((mean + 0.5) | 0);
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Compute right_end_index (patch column index; right region is columns 0..right_end_index-1).
 * `pixelHeight` is the full frame height in pixels (after crop to multiple of 16), NOT the patch row count.
 * Spec: groups_per_column = H // 5  (pixel-level 5-row groups for left-side signature).
 */
export function getRightEndIndex(pixelHeight: number, patchCols: number): number {
  const groupsPerColumn = Math.floor(pixelHeight / 5);
  if (groupsPerColumn <= 0) return 0;
  const numLeftColumns = Math.ceil(SIGNATURE_LENGTH / groupsPerColumn);
  debugLog("getRightEndIndex", {pixelHeight, patchCols, groupsPerColumn, numLeftColumns, rightEndIndex: Math.max(0, patchCols - numLeftColumns)});
  return Math.max(0, patchCols - numLeftColumns);
}

/**
 * Right-side row sums per guide §4 (factor 1, no division). The guide describes
 * rightSide[row] = sum(patch_matrix[row, 0 : right_end_index]). The backend
 * create_column_sums applies % MAX_VAL (MAX_VAL = right_end_index); we apply
 * % rightEndIndex so extracted values are in [0, rightEndIndex) and match the
 * embedded pattern (digits 0-9 for user ID).
 */
export function getRightSideRowSums(
  givenFrame: number[][],
  rightEndIndex: number
): number[] {
  const patchRows = givenFrame.length;
  const rightSide: number[] = [];
  for (let row = 0; row < patchRows; row++) {
    let sum = 0;
    for (let col = 0; col < rightEndIndex && col < givenFrame[row].length; col++) {
      sum += givenFrame[row][col];
    }
    rightSide.push(sum % rightEndIndex);
  }
  return rightSide;
}

/**
 * Decode numeric_user_id from right_side values.
 * Backend encodes a fixed 9-digit decimal string (left-padded with zeros).
 * Use dynamic repsUsed to match backend; decode exactly 9 digits; do not strip trailing zeros.
 * See docs/FRONTEND_USER_ID_DECODE_UPDATE.md.
 */
export function decodeNumericUserIdFromRightSide(rightSide: number[]): number | null {
  const repsUsed = Math.min(REPS, Math.floor(rightSide.length / USER_ID_DIGITS));
  if (repsUsed < 1) {
    debugLog("decodeNumericUserIdFromRightSide: insufficient data", {
      rightSideLength: rightSide.length,
      repsUsed,
    });
    return null;
  }
  const nVals = USER_ID_DIGITS * repsUsed;
  const prefix = rightSide.slice(0, nVals);
  debugLog("decodeNumericUserIdFromRightSide", {
    rightSideLength: rightSide.length,
    repsUsed,
    nVals,
    first50: rightSide.slice(0, 50).join(","),
  });

  const digits: number[] = [];
  const groupDetails: {digitIndex: number; group: number[]; mode: number | null}[] = [];
  for (let d = 0; d < USER_ID_DIGITS; d++) {
    const group = prefix.slice(d * repsUsed, (d + 1) * repsUsed);
    const mode = getMode(group);
    groupDetails.push({digitIndex: d, group, mode});
    if (mode === null || mode < 0 || mode > 9) {
      debugLog("decodeNumericUserIdFromRightSide: invalid mode for digit", {
        digitIndex: d,
        mode,
        group,
        allGroupsSoFar: groupDetails,
      });
      return null;
    }
    digits.push(mode);
  }

  // Concatenate exactly 9 digits; do not strip trailing zeros (backend fixed 9-digit encoding).
  const digitStr = digits.join("");
  debugLog("decodeNumericUserIdFromRightSide: decoded groups", groupDetails);
  const parsed = parseInt(digitStr, 10);
  if (Number.isNaN(parsed)) {
    debugLog("decodeNumericUserIdFromRightSide: parse failed", {digitStr, parsed, digits});
    return null;
  }
  debugLog("decodeNumericUserIdFromRightSide: success", {numericUserId: parsed, digits, digitStr});
  return parsed;
}

function getMode(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of arr) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let maxCount = 0;
  let mode: number | null = null;
  for (const [v, c] of counts) {
    if (c > maxCount) {
      maxCount = c;
      mode = v;
    }
  }
  return mode;
}

/**
 * Left side (signature) per guide §5: pixel columns from right_end_index*16 to end.
 * Column-major 5-pixel groups, 256 slot sums, each value one signature byte (0-255).
 */
export function getLeftSideSignature(
  luma: Uint8Array,
  width: number,
  height: number,
  rightEndIndex: number
): Uint8Array {
  const leftStartCol = rightEndIndex * PATCH_SIZE;
  if (leftStartCol >= width) return new Uint8Array(SIGNATURE_LENGTH);
  const leftWidth = width - leftStartCol;
  const out: number[] = [];
  for (let col = 0; col < leftWidth && out.length < SIGNATURE_LENGTH; col++) {
    const pixelCol = leftStartCol + col;
    for (let groupStart = 0; groupStart + 5 <= height && out.length < SIGNATURE_LENGTH; groupStart += 5) {
      let sum = 0;
      for (let r = 0; r < 5; r++) {
        sum += luma[(groupStart + r) * width + pixelCol];
      }
      out.push(Math.max(0, Math.min(255, sum)));
    }
  }
  const sig = new Uint8Array(SIGNATURE_LENGTH);
  for (let i = 0; i < SIGNATURE_LENGTH && i < out.length; i++) {
    sig[i] = out[i];
  }
  return sig;
}

/**
 * Build message string from first 100 right_side values (code point = value), then UTF-8 encode.
 * Per guide §5: message = right_side.slice(0, 100).map(v => String.fromCharCode(v)).join('')
 */
export function buildMessageBytes(rightSide: number[]): Uint8Array {
  const len = Math.min(MAX_MESSAGE_LENGTH, rightSide.length);
  const chars: string[] = [];
  for (let i = 0; i < len; i++) {
    chars.push(String.fromCharCode(rightSide[i]));
  }
  const str = chars.join("");
  return new TextEncoder().encode(str);
}

/**
 * Import RSA public key from PEM string (Web Crypto).
 */
export async function importPublicKeyFromPem(pem: string): Promise<CryptoKey> {
  const trimmed = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(trimmed);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    "spki",
    buffer,
    {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"},
    false,
    ["verify"]
  );
}

/**
 * Verify one frame: compute right_side and left_side, build message and signature, run RSA verify.
 */
export async function verifyFrame(
  publicKey: CryptoKey,
  rightSide: number[],
  signatureBytes: Uint8Array
): Promise<boolean> {
  const messageBytes = buildMessageBytes(rightSide);
  if (messageBytes.length === 0) return false;
  return crypto.subtle.verify(
    {name: "RSASSA-PKCS1-v1_5"},
    publicKey,
    signatureBytes as BufferSource,
    messageBytes as BufferSource
  );
}

/**
 * Full decode + verify for one frame. Returns verified flag and decoded numeric_user_id (for frame 0).
 */
export async function decodeAndVerifyFrame(
  publicKey: CryptoKey,
  imageData: ImageData
): Promise<{verified: boolean; numericUserId: number | null}> {
  const {luma, width, height} = cropToMultipleOf16(imageData);
  if (width < PATCH_SIZE || height < PATCH_SIZE) {
    return {verified: false, numericUserId: null};
  }
  const givenFrame = buildPatchMatrix(luma, width, height);
  const patchCols = givenFrame[0].length;
  const rightEndIndex = getRightEndIndex(height, patchCols);
  if (rightEndIndex <= 0) return {verified: false, numericUserId: null};

  const rightSide = getRightSideRowSums(givenFrame, rightEndIndex);
  const numericUserId = decodeNumericUserIdFromRightSide(rightSide);
  const signatureBytes = getLeftSideSignature(luma, width, height, rightEndIndex);
  debugLog("decodeAndVerifyFrame: signature first 16 bytes", Array.from(signatureBytes.slice(0, 16)));
  const verified = await verifyFrame(publicKey, rightSide, signatureBytes);
  debugLog("decodeAndVerifyFrame result", {
    verified,
    numericUserId,
    rightSideLength: rightSide.length,
  });
  if (!verified) {
    debugLog("RSA verification failed for this frame (signature or message mismatch)");
  }
  return {verified, numericUserId};
}

/**
 * Decode numeric_user_id from frame 0 only (no key required). Use this to then fetch the public key.
 */
export function decodeNumericUserIdFromFrame(imageData: ImageData): number | null {
  debugLog("decodeNumericUserIdFromFrame: start", {
    width: imageData.width,
    height: imageData.height,
  });
  const {luma, width, height} = cropToMultipleOf16(imageData);
  if (width < PATCH_SIZE || height < PATCH_SIZE) {
    debugLog("decodeNumericUserIdFromFrame: cropped dimensions too small", {
      width,
      height,
      PATCH_SIZE,
    });
    return null;
  }
  const givenFrame = buildPatchMatrix(luma, width, height);
  const patchRows = givenFrame.length;
  const patchCols = givenFrame[0]?.length ?? 0;
  const rightEndIndex = getRightEndIndex(height, patchCols);
  debugLog("decodeNumericUserIdFromFrame: patch layout", {
    patchRows,
    patchCols,
    rightEndIndex,
    pixelHeight: height,
    groupsPerColumn: Math.floor(height / 5),
  });
  if (rightEndIndex <= 0) {
    debugLog("decodeNumericUserIdFromFrame: rightEndIndex <= 0", {rightEndIndex});
    return null;
  }

  const rightSide = getRightSideRowSums(givenFrame, rightEndIndex);
  debugLog("decodeNumericUserIdFromFrame: rightSide (row sums % rightEndIndex)", {
    length: rightSide.length,
    values: rightSide.join(","),
    rightEndIndex,
  });
  const result = decodeNumericUserIdFromRightSide(rightSide);
  if (result === null) {
    const repsUsed = Math.min(REPS, Math.floor(rightSide.length / USER_ID_DIGITS));
    const nVals = USER_ID_DIGITS * repsUsed;
    const prefix = rightSide.slice(0, nVals);
    const first45 = rightSide.slice(0, 45);
    const countIn09 = first45.filter((v) => v >= 0 && v <= 9).length;
    const digitGroups: { digitIndex: number; group: number[]; mode: number | null }[] = [];
    for (let d = 0; d < USER_ID_DIGITS; d++) {
      const group = prefix.slice(d * repsUsed, (d + 1) * repsUsed);
      digitGroups.push({ digitIndex: d, group, mode: getMode(group) });
    }
    const failedDigit = digitGroups.find((g) => g.mode === null || g.mode < 0 || g.mode > 9);
    console.log(
      "[WatermarkDecode] BACKEND_DIAGNOSTIC (copy for backend):",
      JSON.stringify(
        {
          hint: "If first45Values contain numbers > 9, the frontend may not be using the same luma (Y) as the backend. Follow docs/FRONTEND_WATERMARK_VERIFICATION_FIX.md: derive Y from canvas RGB (e.g. BT.709), build 16×16 patch matrix from Y, compute rightSide with factor 1, then decode the 9 digits.",
          videoDimensions: { width: imageData.width, height: imageData.height },
          cropped: { width, height },
          patchLayout: {
            patchRows,
            patchCols,
            rightEndIndex,
            groupsPerColumn: Math.floor(height / 5),
          },
          rightSideSummary: {
            length: rightSide.length,
            repsUsed,
            first45Values: first45,
            countIn0to9: countIn09,
            maxFirst45: first45.length ? Math.max(...first45) : null,
          },
          failedDigit: failedDigit
            ? {
                digitIndex: failedDigit.digitIndex,
                mode: failedDigit.mode,
                groupValues: failedDigit.group,
              }
            : null,
          allDigitModes: digitGroups.map((g) => ({ d: g.digitIndex, mode: g.mode })),
          exactNineGroups: digitGroups.map((g) => ({
            digitIndex: g.digitIndex,
            groupValues: g.group,
            mode: g.mode,
          })),
        },
        null,
        2
      )
    );
  } else {
    const repsUsed = Math.min(REPS, Math.floor(rightSide.length / USER_ID_DIGITS));
    const nVals = USER_ID_DIGITS * repsUsed;
    const prefix = rightSide.slice(0, nVals);
    const digitGroups: { digitIndex: number; group: number[]; mode: number | null }[] = [];
    for (let d = 0; d < USER_ID_DIGITS; d++) {
      const group = prefix.slice(d * repsUsed, (d + 1) * repsUsed);
      digitGroups.push({ digitIndex: d, group, mode: getMode(group) });
    }
    const decodedDigitStr = digitGroups
      .map((g) => (g.mode !== null && g.mode >= 0 && g.mode <= 9 ? String(g.mode) : "?"))
      .join("");
    console.log(
      "[WatermarkDecode] BACKEND_DIAGNOSTIC success (copy for backend if decoded ID is wrong):",
      JSON.stringify(
        {
          decodedNumericUserId: result,
          decodedDigitStr,
          videoDimensions: { width: imageData.width, height: imageData.height },
          cropped: { width, height },
          patchLayout: { patchRows, patchCols, rightEndIndex },
          rightSideSummary: {
            length: rightSide.length,
            repsUsed,
            firstNValues: rightSide.slice(0, nVals),
          },
          exactNineGroups: digitGroups.map((g) => ({
            digitIndex: g.digitIndex,
            groupValues: g.group,
            mode: g.mode,
          })),
        },
        null,
        2
      )
    );
  }
  return result;
}

/**
 * Fetch public key PEM from Next.js API by numeric_user_id.
 */
export async function fetchPublicKeyPem(numericUserId: number): Promise<string> {
  const res = await fetch(`/api/users/${numericUserId}/public-key`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Failed to fetch public key: ${res.status}`);
  }
  const data = await res.json();
  if (!data.success || !data.data?.public_key_pem) {
    throw new Error("Invalid public key response");
  }
  return data.data.public_key_pem;
}
