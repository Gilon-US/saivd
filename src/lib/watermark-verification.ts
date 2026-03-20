/**
 * Client-side watermark verification aligned with backend checklist (canvas, crop, BT.709 luma,
 * 16×16 patch matrix, rightEndIndex, row sums factor 1, 9-digit decode from frame 0).
 * Decodes numeric_user_id from frame 0 (no key); verifies frames 0, 10, 20, ... with RSA.
 * See docs/WATERMARK_DATA_AND_DECODING_GUIDE.md and docs/FRONTEND_WATERMARK_VERIFICATION_IMPLEMENTATION_GUIDE.md.
 *
 * Pipeline: canvas 1:1 with video dimensions; crop to mult 16; luma from RGB using limited-range BT.709
 * (16–235) per implementation guide §3.2; patch = 16×16 mean via (sum+128)>>8; rightSide[r] =
 * rawSum[r] % rightEndIndex (rawSum = sum over cols [0, rightEndIndex), factor 1); decode = mode
 * of 9 groups (backend encodes so digit = row_sum % right_end_index).
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
export const V2_CALIBRATION_MARKER = [0, 5, 9, 0, 5, 9] as const;
export const V2_BOOTSTRAP_FRAME_COUNT = 3;

export function captureVideoFrameImageData(video: HTMLVideoElement): ImageData | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Extract luma (Y) from RGBA ImageData using limited-range BT.709 (16–235).
 *
 * Backend watermarking operates on the raw Y plane in limited-range BT.709; browser decoders
 * output full-range RGB. Converting canvas RGB back to limited-range Y (per
 * FRONTEND_WATERMARK_VERIFICATION_IMPLEMENTATION_GUIDE §3.2) aligns frontend decoding with
 * normalized/watermarked video produced by the backend.
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

/**
 * Crop to multiples of 16 for patch matrix (backend checklist §1).
 * cropW = width - (width % 16), cropH = height - (height % 16). Use only top-left cropW×cropH.
 */
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
 * Crop raw luma (Y) to multiples of 16. Use when Y comes from a non-canvas source (e.g. WebCodecs I420 plane).
 */
export function cropLumaToMultipleOf16(
  luma: Uint8Array,
  width: number,
  height: number
): {luma: Uint8Array; width: number; height: number} {
  const w = width - (width % PATCH_SIZE);
  const h = height - (height % PATCH_SIZE);
  if (w <= 0 || h <= 0) return {luma: new Uint8Array(0), width: 0, height: 0};
  const cropped = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cropped[y * w + x] = luma[y * width + x];
    }
  }
  return {luma: cropped, width: w, height: h};
}

/**
 * Decode numeric user ID from raw luma (Y) only. Use when Y is already available (e.g. Y plane from
 * WebCodecs I420 VideoFrame). Same pipeline as decodeNumericUserIdFromFrame but skips RGB→Y.
 * See docs/WATERMARK_VERIFICATION_CAPTURE_OPTIONS.md.
 */
export function decodeNumericUserIdFromLuma(
  luma: Uint8Array,
  width: number,
  height: number
): number | null {
  const {luma: cropped, width: w, height: h} = cropLumaToMultipleOf16(luma, width, height);
  if (w < PATCH_SIZE || h < PATCH_SIZE) return null;
  const givenFrame = buildPatchMatrix(cropped, w, h);
  const patchCols = givenFrame[0]?.length ?? 0;
  const rightEndIndex = getRightEndIndex(h, patchCols);
  if (rightEndIndex <= 0) return null;
  const rightSide = getRightSideRowSums(givenFrame, rightEndIndex);
  return decodeNumericUserIdFromRightSide(rightSide);
}

/**
 * Patch matrix per backend checklist §3: block layout r*16..r*16+15, c*16..c*16+15;
 * patchRows = cropH/16, patchCols = cropW/16. Mean of 256 Y values per block using integer
 * rounding to avoid float precision issues: (sum + 128) >> 8 === Math.round(sum/256).
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
      row.push((sum + 128) >> 8);
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Right-end index per backend checklist §4: groupsPerColumn = floor(cropH/5),
 * numLeftColumns = ceil(256/groupsPerColumn), rightEndIndex = patchCols - numLeftColumns.
 */
export function getRightEndIndex(pixelHeight: number, patchCols: number): number {
  const groupsPerColumn = Math.floor(pixelHeight / 5);
  if (groupsPerColumn <= 0) return 0;
  const numLeftColumns = Math.ceil(SIGNATURE_LENGTH / groupsPerColumn);
  debugLog("getRightEndIndex", {pixelHeight, patchCols, groupsPerColumn, numLeftColumns, rightEndIndex: Math.max(0, patchCols - numLeftColumns)});
  return Math.max(0, patchCols - numLeftColumns);
}

/**
 * Right-side row sums per backend spec: rawSum[r] = sum of patch row r, cols 0..rightEndIndex-1
 * (factor 1); value[r] = rawSum[r] % rightEndIndex so value is in [0, rightEndIndex-1].
 * Backend encodes so (row_sum % right_end_index) = digit (0–9); frontend applies same modulo.
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
 * Decode numeric user ID from rightSide (backend checklist §5): frame 0 only; repsUsed = min(7, floor(len/9));
 * usable = 9*repsUsed; nine groups of repsUsed values; mode per group (must be 0–9); digitStr = join; no strip trailing zeros.
 */
export function decodeNumericUserIdFromRightSide(rightSide: number[]): number | null {
  const fullGroups = V2_CALIBRATION_MARKER.length + USER_ID_DIGITS;
  const repsUsed = Math.min(REPS, Math.floor(rightSide.length / fullGroups));
  if (repsUsed < 1) {
    debugLog("decodeNumericUserIdFromRightSide: insufficient data", {
      rightSideLength: rightSide.length,
      repsUsed,
    });
    return null;
  }
  const nVals = fullGroups * repsUsed;
  const prefix = rightSide.slice(0, nVals);
  const markerPrefix = prefix.slice(0, V2_CALIBRATION_MARKER.length * repsUsed);
  const modulo = Math.max(10, (prefix.length ? Math.max(...prefix) : 0) + 1);

  // Solve deterministic decode shift from the calibration marker groups.
  let bestShift = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let shift = 0; shift < modulo; shift++) {
    let score = 0;
    for (let i = 0; i < V2_CALIBRATION_MARKER.length; i++) {
      const group = markerPrefix.slice(i * repsUsed, (i + 1) * repsUsed).map((v) => (v - shift + modulo) % modulo);
      const m = getMode(group);
      const expected = V2_CALIBRATION_MARKER[i];
      if (m === null) {
        score += 99;
      } else {
        score += Math.abs(m - expected);
      }
    }
    if (score < bestScore) {
      bestScore = score;
      bestShift = shift;
    }
    if (score === 0) break;
  }
  const corrected = prefix.map((v) => (v - bestShift + modulo) % modulo);
  debugLog("decodeNumericUserIdFromRightSide", {
    rightSideLength: rightSide.length,
    repsUsed,
    nVals,
    bestShift,
    bestScore,
    first50: rightSide.slice(0, 50).join(","),
  });

  const digits: number[] = [];
  const groupDetails: {digitIndex: number; group: number[]; mode: number | null}[] = [];
  for (let d = 0; d < USER_ID_DIGITS; d++) {
    const start = (V2_CALIBRATION_MARKER.length + d) * repsUsed;
    const group = corrected.slice(start, start + repsUsed);
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

/**
 * Mode (most frequent value). On tie, prefer smallest value so e.g. 000000001 decodes to 1 not 100000001.
 */
function getMode(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of arr) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let maxCount = 0;
  let mode: number | null = null;
  for (const [v, c] of counts) {
    if (c > maxCount || (c === maxCount && (mode === null || v < mode))) {
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
 * Same as decodeAndVerifyFrame but from raw luma (e.g. Y plane from WebCodecs I420).
 * Use for accurate verification when Y comes from the codec.
 */
export async function decodeAndVerifyFrameFromLuma(
  publicKey: CryptoKey,
  luma: Uint8Array,
  width: number,
  height: number
): Promise<{verified: boolean; numericUserId: number | null}> {
  const {luma: cropped, width: w, height: h} = cropLumaToMultipleOf16(luma, width, height);
  if (w < PATCH_SIZE || h < PATCH_SIZE) return {verified: false, numericUserId: null};
  const givenFrame = buildPatchMatrix(cropped, w, h);
  const patchCols = givenFrame[0].length;
  const rightEndIndex = getRightEndIndex(h, patchCols);
  if (rightEndIndex <= 0) return {verified: false, numericUserId: null};
  const rightSide = getRightSideRowSums(givenFrame, rightEndIndex);
  const numericUserId = decodeNumericUserIdFromRightSide(rightSide);
  const signatureBytes = getLeftSideSignature(cropped, w, h, rightEndIndex);
  const verified = await verifyFrame(publicKey, rightSide, signatureBytes);
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
  debugLog("decodeNumericUserIdFromFrame: rightSide (row sums, factor 1)", {
    length: rightSide.length,
    values: rightSide.join(","),
    rightEndIndex,
  });

  // Diagnostic: luma stats (Y range), patch matrix stats, raw row sums before modulo
  let lumaMin: number | null = null;
  let lumaMax: number | null = null;
  let lumaSum = 0;
  for (let i = 0; i < luma.length; i++) {
    const v = luma[i];
    lumaSum += v;
    if (lumaMin === null || v < lumaMin) lumaMin = v;
    if (lumaMax === null || v > lumaMax) lumaMax = v;
  }
  const lumaMean = luma.length ? lumaSum / luma.length : null;
  const allPatchValues: number[] = [];
  for (let r = 0; r < givenFrame.length; r++) {
    for (let c = 0; c < givenFrame[r].length; c++) {
      allPatchValues.push(givenFrame[r][c]);
    }
  }
  const patchMin = allPatchValues.length ? Math.min(...allPatchValues) : null;
  const patchMax = allPatchValues.length ? Math.max(...allPatchValues) : null;
  const patchMean = allPatchValues.length
    ? allPatchValues.reduce((a, b) => a + b, 0) / allPatchValues.length
    : null;
  const patchSample: number[][] = [];
  for (let r = 0; r < Math.min(5, givenFrame.length); r++) {
    patchSample.push(
      givenFrame[r].slice(0, Math.min(12, givenFrame[r].length))
    );
  }
  const rawRowSumsFirst12: { row: number; rawSum: number; afterMod: number }[] = [];
  for (let row = 0; row < Math.min(12, givenFrame.length); row++) {
    let raw = 0;
    for (let c = 0; c < rightEndIndex && c < givenFrame[row].length; c++) {
      raw += givenFrame[row][c];
    }
    rawRowSumsFirst12.push({ row, rawSum: raw, afterMod: rightSide[row] });
  }

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
          hint: "If first45Values contain numbers > 9, luma/patch pipeline may not match backend. Use limited-range BT.709 (16–235); rightSide[row] = rawSum[row] % rightEndIndex (rawSum = sum over cols [0, rightEndIndex), factor 1). Canvas = video.videoWidth×video.videoHeight, 1:1 draw; crop to mult 16.",
          videoDimensions: { width: imageData.width, height: imageData.height },
          cropped: { width, height },
          lumaStats: { min: lumaMin, max: lumaMax, mean: lumaMean != null ? Math.round(lumaMean * 10) / 10 : null, formula: "BT.709_limited_range_16_235" },
          patchMatrixStats: { min: patchMin, max: patchMax, mean: patchMean != null ? Math.round(patchMean * 10) / 10 : null },
          patchMatrixSampleFirst5Rows12Cols: patchSample,
          rawRowSumsFirst12,
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
