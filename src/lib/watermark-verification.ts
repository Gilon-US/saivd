/**
 * Client-side watermark verification (decode + RSA verify) per FRONTEND_WATERMARK_VERIFICATION_SPEC.md.
 * Decodes numeric_user_id from frame 0 and verifies frames 0, 10, 20, ... using the creator's public RSA key.
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

/** Extract luma (Y) from RGBA ImageData; single value per pixel. */
function imageDataToLuma(data: ImageData): Uint8Array {
  const {width, height, data: rgba} = data;
  const luma = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
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
 * Backend: `create_column_sums(given_frame, ..., factor=1)`
 * np.sum(given_frame[start:end], axis=1) // factor  →  row sums (one per row)
 * Then: (row_sums + additions) % MAX_VAL
 * With private_key=None, additions=0.  MAX_VAL = right_end_index (given_frame.shape[1] after slicing).
 *
 * Result length = patchRows (one value per row), each in range [0, rightEndIndex).
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
    const value = Math.floor(sum / FACTOR) % rightEndIndex;
    rightSide.push(value);
  }
  return rightSide;
}

/**
 * Decode numeric_user_id from right_side values.
 * Backend trims to a multiple of REPS (7), reshapes to (-1, 7), takes mode per group.
 * For 1080p (67 patch rows): 63 usable → 9 digits.
 * For 704p  (44 patch rows): 42 usable → 6 digits.
 * Backend then takes first 9 digits and rstrip('0').
 */
export function decodeNumericUserIdFromRightSide(rightSide: number[]): number | null {
  const usable = rightSide.length - (rightSide.length % REPS);
  const numGroups = Math.floor(usable / REPS);
  debugLog("decodeNumericUserIdFromRightSide", {
    rightSideLength: rightSide.length,
    usable,
    numGroups,
    maxDigits: Math.min(numGroups, USER_ID_DIGITS),
    first50: rightSide.slice(0, 50).join(","),
  });
  if (numGroups === 0) {
    debugLog("decodeNumericUserIdFromRightSide: no usable groups");
    return null;
  }
  const maxDigits = Math.min(numGroups, USER_ID_DIGITS);
  const digits: number[] = [];
  const groupDetails: {digitIndex: number; group: number[]; mode: number | null}[] = [];
  for (let d = 0; d < maxDigits; d++) {
    const group = rightSide.slice(d * REPS, (d + 1) * REPS);
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
  // Backend: ''.join(str(d) for d in digits[:9]).rstrip('0')
  let str = digits.join("");
  str = str.replace(/0+$/, "");
  debugLog("decodeNumericUserIdFromRightSide: decoded groups", groupDetails);
  if (!str || str.length === 0) {
    debugLog("decodeNumericUserIdFromRightSide: all zeros after rstrip");
    return null;
  }
  const parsed = parseInt(str, 10);
  if (Number.isNaN(parsed)) {
    debugLog("decodeNumericUserIdFromRightSide: parse failed", {str, parsed, digits});
    return null;
  }
  debugLog("decodeNumericUserIdFromRightSide: success", {numericUserId: parsed, digits, str});
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
 * Left side (signature): pixel region from left_start_col to end. Column-major 5-pixel groups, 256 values, clamp 0-255.
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
 */
export function buildMessageBytes(rightSide: number[]): Uint8Array {
  const len = Math.min(MAX_MESSAGE_LENGTH, rightSide.length);
  const chars: string[] = [];
  for (let i = 0; i < len; i++) {
    chars.push(String.fromCodePoint(rightSide[i]));
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
  return decodeNumericUserIdFromRightSide(rightSide);
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
