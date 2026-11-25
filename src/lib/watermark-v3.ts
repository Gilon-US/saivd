/**
 * Watermark format v3 reader (Y + U + V, signed). Pure functions, no DOM.
 *
 * Port of the saivd-backend reference implementation:
 *   - watermark_video/watermark_v3.py      (v3_layout, extract_frame_v3)
 *   - watermark_video/signature_codec.py   (QIM, interleave, Reed-Solomon, user-ID block, v3 message)
 *   - watermark_video/watermark_call_function.py (extract_user_id_from_plane, payload_end_patch_col)
 * Spec: saivd-backend/docs/VIEWER_WATERMARK_DECODING_GUIDE.md. When the guide and the backend code
 * disagree, the backend code wins; keep this file a faithful port.
 *
 * The legacy v2 reader (src/lib/watermark-verification.ts) is kept unchanged; v2 and v3 are separate
 * modes, detected per video by whether the U/V user-ID block is valid.
 */

export const V3_PATCH_Y = 16;
export const V3_PATCH_UV = 8;
export const V3_SIGNATURE_BYTES = 256;
export const V3_RS_N = 144;
export const V3_RS_K = 128;
export const V3_RS_NSYM = V3_RS_N - V3_RS_K;
export const V3_RS_CODEWORDS = V3_SIGNATURE_BYTES / V3_RS_K;
export const V3_SIGNATURE_BITS = V3_RS_CODEWORDS * V3_RS_N * 8; // 2304
export const V3_QIM_Q = 4;
export const V3_USER_ID_BLOCK_BITS = 64;
export const V3_USER_ID_BLOCK_MARKER = 0xa5c3;
export const V3_USER_ID_BLOCK_FORMAT = 1;
export const V3_USER_ID_MAX = 2 ** 30 - 1;
export const V3_MIN_USER_ID_COPIES_PER_PLANE = 3;
export const V3_MAX_USER_ID_COPIES_PER_PLANE = 9;

const SIGNATURE_GROUP_COUNT = 256;
const SIGNATURE_GROUP_HEIGHT = 5;
const V2_CALIBRATION_MARKER = [0, 5, 9, 0, 5, 9];
const V2_USER_ID_DIGITS = 9;
const V2_REPS = 7;

/** One decoded yuv420p frame with packed planes: Y stride = width, U/V stride = ceil(width / 2). */
export type YuvFrame = {
  y: Uint8Array;
  u: Uint8Array;
  v: Uint8Array;
  width: number;
  height: number;
};

export type V3Layout = {
  rows: number;
  cols: number;
  payloadEnd: number;
  ySigCapacity: number;
  uvSigCapacity: number;
  uvPatches: number;
  userIdCopiesPerPlane: number;
  uvBits: number;
};

// ============================================
// LAYOUT
// ============================================

/** Patch columns [0, result) carry the Y payload; the rest hold the signature (same as v2). */
export function payloadEndPatchCol(pixelHeight: number, patchCols: number): number {
  const groupsPerColumn = Math.floor(pixelHeight / SIGNATURE_GROUP_HEIGHT);
  if (groupsPerColumn <= 0) return patchCols;
  const signatureCols = Math.ceil(SIGNATURE_GROUP_COUNT / groupsPerColumn);
  return patchCols - signatureCols;
}

/** v3 layout for a frame of this size, or null when the frame is too small for v3. */
export function v3Layout(width: number, height: number): V3Layout | null {
  const rows = Math.floor(height / V3_PATCH_Y);
  const cols = Math.floor(width / V3_PATCH_Y);
  if (rows <= 0 || cols <= 0) return null;
  const payloadEnd = payloadEndPatchCol(rows * V3_PATCH_Y, cols);
  if (payloadEnd <= 0) return null;
  const ySigCapacity = rows * (cols - payloadEnd);
  const uvSigCapacity = Math.max(0, Math.ceil((V3_SIGNATURE_BITS - ySigCapacity) / 2));
  const uvPatches = rows * cols;
  const userIdCopiesPerPlane = Math.min(
    V3_MAX_USER_ID_COPIES_PER_PLANE,
    Math.floor((uvPatches - uvSigCapacity) / V3_USER_ID_BLOCK_BITS)
  );
  if (userIdCopiesPerPlane < V3_MIN_USER_ID_COPIES_PER_PLANE) return null;
  return {
    rows,
    cols,
    payloadEnd,
    ySigCapacity,
    uvSigCapacity,
    uvPatches,
    userIdCopiesPerPlane,
    uvBits: uvSigCapacity + userIdCopiesPerPlane * V3_USER_ID_BLOCK_BITS,
  };
}

// ============================================
// QIM ON PATCH MEANS
// ============================================

/**
 * round(sum / divisor) with ties to even (NumPy's np.round), on non-negative integers.
 * Exact integer arithmetic, so it matches the backend's float64 mean / Q bit for bit.
 */
export function roundHalfEvenRatio(sum: number, divisor: number): number {
  const q = Math.floor(sum / divisor);
  const twiceRemainder = 2 * (sum - q * divisor);
  if (twiceRemainder < divisor) return q;
  if (twiceRemainder > divisor) return q + 1;
  return q % 2 === 0 ? q : q + 1;
}

/**
 * Read QIM bits (bit = round(mean / Q) mod 2) from the patches of a plane region, row-major:
 * patch rows [0, patchRows), patch columns [colStart, colEnd). Returns at most nBits bits.
 */
export function qimReadBits(
  plane: Uint8Array,
  stride: number,
  patch: number,
  patchRows: number,
  colStart: number,
  colEnd: number,
  nBits: number
): Uint8Array {
  const regionCols = Math.max(0, colEnd - colStart);
  const total = Math.min(nBits, patchRows * regionCols);
  const out = new Uint8Array(total);
  const divisor = patch * patch * V3_QIM_Q;
  let i = 0;
  for (let r = 0; r < patchRows && i < total; r++) {
    for (let c = colStart; c < colEnd && i < total; c++) {
      let sum = 0;
      const x0 = c * patch;
      for (let dy = 0; dy < patch; dy++) {
        const rowOffset = (r * patch + dy) * stride + x0;
        for (let dx = 0; dx < patch; dx++) {
          sum += plane[rowOffset + dx];
        }
      }
      out[i++] = roundHalfEvenRatio(sum, divisor) & 1;
    }
  }
  return out;
}

// ============================================
// BITS / BYTES / CRC
// ============================================

/** np.packbits: MSB first; a trailing partial byte is zero-padded. */
export function packBitsMsbFirst(bits: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) out[i >> 3] |= 0x80 >> (i & 7);
  }
  return out;
}

/** np.unpackbits: MSB first. */
export function unpackBitsMsbFirst(bytes: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < out.length; i++) {
    out[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  }
  return out;
}

/** CRC-16/CCITT-FALSE: init 0xFFFF, poly 0x1021, no reflection, no final XOR. */
export function crc16CcittFalse(data: ArrayLike<number>): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

// ============================================
// INTERLEAVE (round-robin over Y, U, V, skipping full planes)
// ============================================

export function interleaveOrder(nBits: number, capacities: readonly number[]): number[][] {
  const total = capacities.reduce((a, b) => a + b, 0);
  if (total < nBits) {
    throw new Error(`signature needs ${nBits} bits but planes hold ${total}`);
  }
  const used = capacities.map(() => 0);
  const order: number[][] = capacities.map(() => []);
  let plane = 0;
  for (let i = 0; i < nBits; i++) {
    while (used[plane] >= capacities[plane]) {
      plane = (plane + 1) % capacities.length;
    }
    order[plane].push(i);
    used[plane] += 1;
    plane = (plane + 1) % capacities.length;
  }
  return order;
}

export function interleaveBits(bits: ArrayLike<number>, capacities: readonly number[]): Uint8Array[] {
  return interleaveOrder(bits.length, capacities).map((idx) => Uint8Array.from(idx, (i) => bits[i]));
}

export function deinterleaveBits(
  perPlane: readonly ArrayLike<number>[],
  capacities: readonly number[],
  nBits: number = V3_SIGNATURE_BITS
): Uint8Array {
  const order = interleaveOrder(nBits, capacities);
  const bits = new Uint8Array(nBits);
  order.forEach((idx, p) => {
    const planeBits = perPlane[p];
    for (let k = 0; k < idx.length && k < planeBits.length; k++) {
      bits[idx[k]] = planeBits[k];
    }
  });
  return bits;
}

// ============================================
// GF(256) + REED-SOLOMON (primitive polynomial 0x11d, generator 2, first consecutive root 0)
// ============================================

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

/** Python-style modulo (result has the sign of the divisor). */
function pyMod(a: number, m: number): number {
  return ((a % m) + m) % m;
}

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function gfDiv(x: number, y: number): number {
  if (y === 0) throw new Error("RS: division by zero");
  if (x === 0) return 0;
  return GF_EXP[pyMod(GF_LOG[x] + 255 - GF_LOG[y], 255)];
}

function gfPow(x: number, power: number): number {
  return GF_EXP[pyMod(GF_LOG[x] * power, 255)];
}

function gfInverse(x: number): number {
  return GF_EXP[255 - GF_LOG[x]];
}

function polyScale(p: number[], x: number): number[] {
  return p.map((c) => gfMul(c, x));
}

function polyAdd(p: number[], q: number[]): number[] {
  const r = new Array<number>(Math.max(p.length, q.length)).fill(0);
  for (let i = 0; i < p.length; i++) r[i + r.length - p.length] = p[i];
  for (let i = 0; i < q.length; i++) r[i + r.length - q.length] ^= q[i];
  return r;
}

function polyMul(p: number[], q: number[]): number[] {
  const r = new Array<number>(p.length + q.length - 1).fill(0);
  for (let j = 0; j < q.length; j++) {
    for (let i = 0; i < p.length; i++) {
      r[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return r;
}

function polyEval(poly: number[], x: number): number {
  let y = poly[0];
  for (let i = 1; i < poly.length; i++) y = gfMul(y, x) ^ poly[i];
  return y;
}

function generatorPoly(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i++) g = polyMul(g, [1, gfPow(2, i)]);
  return g;
}

const RS_GENERATOR = generatorPoly(V3_RS_NSYM);

/** Systematic RS encode: data followed by nsym parity bytes. */
export function rsEncode(data: ArrayLike<number>, nsym: number = V3_RS_NSYM): Uint8Array {
  const gen = nsym === V3_RS_NSYM ? RS_GENERATOR : generatorPoly(nsym);
  const out = new Array<number>(data.length + nsym).fill(0);
  for (let i = 0; i < data.length; i++) out[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const coef = out[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) out[i + j] ^= gfMul(gen[j], coef);
    }
  }
  const result = new Uint8Array(data.length + nsym);
  for (let i = 0; i < data.length; i++) result[i] = data[i];
  for (let i = data.length; i < result.length; i++) result[i] = out[i];
  return result;
}

function syndromes(msg: number[], nsym: number): number[] {
  const s = [0];
  for (let i = 0; i < nsym; i++) s.push(polyEval(msg, gfPow(2, i)));
  return s;
}

function errataLocator(ePos: number[]): number[] {
  let loc = [1];
  for (const p of ePos) loc = polyMul(loc, polyAdd([1], [gfPow(2, p), 0]));
  return loc;
}

function errorEvaluator(synd: number[], errLoc: number[], nsym: number): number[] {
  const remainder = polyMul(synd, errLoc);
  return remainder.slice(remainder.length - (nsym + 1));
}

function correctErrata(msg: number[], synd: number[], errPos: number[]): number[] {
  const coefPos = errPos.map((p) => msg.length - 1 - p);
  const errLoc = errataLocator(coefPos);
  const errEval = errorEvaluator([...synd].reverse(), errLoc, errLoc.length - 1).reverse();
  const xList = coefPos.map((p) => gfPow(2, -(255 - p)));
  const e = new Array<number>(msg.length).fill(0);
  for (let i = 0; i < xList.length; i++) {
    const xi = xList[i];
    const xiInv = gfInverse(xi);
    let prime = 1;
    for (let j = 0; j < xList.length; j++) {
      if (j !== i) prime = gfMul(prime, 1 ^ gfMul(xiInv, xList[j]));
    }
    const y = gfMul(xi, polyEval([...errEval].reverse(), xiInv));
    if (prime === 0) throw new Error("RS: could not find error magnitude");
    e[errPos[i]] = gfDiv(y, prime);
  }
  return polyAdd(msg, e);
}

function findErrorLocator(synd: number[], nsym: number): number[] {
  let errLoc = [1];
  let oldLoc = [1];
  const syndShift = synd.length - nsym;
  for (let i = 0; i < nsym; i++) {
    const k = i + syndShift;
    let delta = synd[k];
    for (let j = 1; j < errLoc.length; j++) {
      delta ^= gfMul(errLoc[errLoc.length - (j + 1)], synd[k - j]);
    }
    oldLoc = [...oldLoc, 0];
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, gfInverse(delta));
        errLoc = newLoc;
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }
  while (errLoc.length && errLoc[0] === 0) errLoc.shift();
  if ((errLoc.length - 1) * 2 > nsym) throw new Error("RS: too many errors to correct");
  return errLoc;
}

function findErrors(errLoc: number[], nmess: number): number[] {
  const errs = errLoc.length - 1;
  const errPos: number[] = [];
  for (let i = 0; i < nmess; i++) {
    if (polyEval(errLoc, gfPow(2, i)) === 0) errPos.push(nmess - 1 - i);
  }
  if (errPos.length !== errs) throw new Error("RS: could not locate errors");
  return errPos;
}

/** Corrected data bytes, or null if the codeword is uncorrectable (more than nsym/2 byte errors). */
export function rsDecode(codeword: ArrayLike<number>, nsym: number = V3_RS_NSYM): Uint8Array | null {
  try {
    let msg = Array.from(codeword);
    const synd = syndromes(msg, nsym);
    if (Math.max(...synd) === 0) return Uint8Array.from(msg.slice(0, msg.length - nsym));
    const errLoc = findErrorLocator(synd.slice(1), nsym);
    const errPos = findErrors([...errLoc].reverse(), msg.length);
    const sortedPos = [...new Set(errPos)].sort((a, b) => a - b);
    msg = correctErrata(msg, synd, sortedPos);
    if (Math.max(...syndromes(msg, nsym)) > 0) return null;
    return Uint8Array.from(msg.slice(0, msg.length - nsym));
  } catch {
    return null;
  }
}

/** 256-byte signature -> 2304 coded bits (two RS(144,128) codewords, MSB first). */
export function signatureToBits(signature: ArrayLike<number>): Uint8Array {
  if (signature.length !== V3_SIGNATURE_BYTES) {
    throw new Error(`expected ${V3_SIGNATURE_BYTES}-byte signature, got ${signature.length}`);
  }
  const coded = new Uint8Array(V3_RS_CODEWORDS * V3_RS_N);
  for (let i = 0; i < V3_RS_CODEWORDS; i++) {
    const chunk = Array.from(signature).slice(i * V3_RS_K, (i + 1) * V3_RS_K);
    coded.set(rsEncode(chunk), i * V3_RS_N);
  }
  return unpackBitsMsbFirst(coded);
}

/** RS-correct 2304 read bits back into the 256-byte signature; null if any codeword is uncorrectable. */
export function bitsToSignature(bits: ArrayLike<number>): Uint8Array | null {
  const coded = packBitsMsbFirst(Array.from(bits).slice(0, V3_SIGNATURE_BITS));
  const out = new Uint8Array(V3_SIGNATURE_BYTES);
  for (let i = 0; i < V3_RS_CODEWORDS; i++) {
    const data = rsDecode(coded.subarray(i * V3_RS_N, (i + 1) * V3_RS_N));
    if (!data) return null;
    out.set(data, i * V3_RS_K);
  }
  return out;
}

// ============================================
// USER-ID BLOCK (U/V): 16-bit marker | 2-bit format | 30-bit user id | CRC-16 over the first 6 bytes
// ============================================

export function userIdBlockBits(userId: number): Uint8Array {
  if (!Number.isInteger(userId) || userId < 0 || userId > V3_USER_ID_MAX) {
    throw new Error(`user_id ${userId} does not fit in 30 bits`);
  }
  const head = new Uint8Array(6);
  head[0] = V3_USER_ID_BLOCK_MARKER >> 8;
  head[1] = V3_USER_ID_BLOCK_MARKER & 0xff;
  head[2] = (V3_USER_ID_BLOCK_FORMAT << 6) | ((userId >>> 24) & 0x3f);
  head[3] = (userId >>> 16) & 0xff;
  head[4] = (userId >>> 8) & 0xff;
  head[5] = userId & 0xff;
  const crc = crc16CcittFalse(head);
  return unpackBitsMsbFirst([...head, crc >> 8, crc & 0xff]);
}

/** Majority-vote the repeated 64-bit blocks (tie -> 0), then check CRC, marker and format. */
export function decodeUserIdBlock(bits: ArrayLike<number>): number | null {
  const copies = Math.floor(bits.length / V3_USER_ID_BLOCK_BITS);
  if (copies === 0) return null;
  const voted = new Uint8Array(V3_USER_ID_BLOCK_BITS);
  for (let b = 0; b < V3_USER_ID_BLOCK_BITS; b++) {
    let votes = 0;
    for (let c = 0; c < copies; c++) votes += bits[c * V3_USER_ID_BLOCK_BITS + b] ? 1 : 0;
    voted[b] = votes * 2 > copies ? 1 : 0;
  }
  const word = packBitsMsbFirst(voted);
  const crc = (word[6] << 8) | word[7];
  if (crc16CcittFalse(word.subarray(0, 6)) !== crc) return null;
  const marker = (word[0] << 8) | word[1];
  const format = word[2] >> 6;
  if (marker !== V3_USER_ID_BLOCK_MARKER || format !== V3_USER_ID_BLOCK_FORMAT) return null;
  return ((word[2] & 0x3f) * 2 ** 24) + (word[3] << 16) + (word[4] << 8) + word[5];
}

// ============================================
// Y PAYLOAD (keyless, v2-compatible): exact port of extract_user_id_from_plane
// ============================================

/** np.unique + argmax: most frequent value, smallest on a tie. */
function modeSmallest(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = Number.POSITIVE_INFINITY;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && v < best)) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Decode the Y payload (marker 059059 + 9-digit user id) from patch columns [0, payloadEnd).
 * Patch means use floor(mean + 0.5); row sums are taken mod payloadEnd; the shift search runs over
 * [0, payloadEnd) on the marker groups' modes, starting from best score 7 (as in the backend).
 */
export function decodeYPayloadUserId(
  y: Uint8Array,
  stride: number,
  rows: number,
  payloadEnd: number
): number | null {
  if (rows <= 0 || payloadEnd <= 0) return null;
  const rowSums: number[] = [];
  for (let r = 0; r < rows; r++) {
    let rowSum = 0;
    for (let c = 0; c < payloadEnd; c++) {
      let sum = 0;
      for (let dy = 0; dy < V3_PATCH_Y; dy++) {
        const rowOffset = (r * V3_PATCH_Y + dy) * stride + c * V3_PATCH_Y;
        for (let dx = 0; dx < V3_PATCH_Y; dx++) sum += y[rowOffset + dx];
      }
      rowSum += Math.floor((sum + 128) / 256);
    }
    rowSums.push(rowSum % payloadEnd);
  }

  const markerDigits = V2_CALIBRATION_MARKER.length;
  const fullGroups = markerDigits + V2_USER_ID_DIGITS;
  const repsUsed = Math.min(V2_REPS, Math.floor(rowSums.length / fullGroups));
  if (repsUsed < 1) return null;
  const usable = rowSums.slice(0, fullGroups * repsUsed);
  const group = (values: number[], g: number) => values.slice(g * repsUsed, (g + 1) * repsUsed);

  const observedModes = V2_CALIBRATION_MARKER.map((_, i) => modeSmallest(group(usable, i)));
  let bestShift = 0;
  let bestScore = markerDigits + 1;
  for (let shift = 0; shift < payloadEnd; shift++) {
    let score = 0;
    for (let i = 0; i < markerDigits; i++) {
      score += Math.abs(pyMod(observedModes[i] - shift, payloadEnd) - V2_CALIBRATION_MARKER[i]);
    }
    if (score < bestScore) {
      bestScore = score;
      bestShift = shift;
    }
    if (score === 0) break;
  }

  const corrected = usable.map((v) => pyMod(v - bestShift, payloadEnd));
  const digits: number[] = [];
  for (let d = 0; d < V2_USER_ID_DIGITS; d++) {
    const m = modeSmallest(group(corrected, markerDigits + d));
    if (m < 0 || m > 9) return null;
    digits.push(m);
  }
  return parseInt(digits.join(""), 10);
}

// ============================================
// FRAME READING + SIGNATURE
// ============================================

export type V3FrameReading = {
  layout: V3Layout;
  /** CRC-checked U/V user id when the block is valid, otherwise the Y payload id. */
  userId: number | null;
  userIdY: number | null;
  userIdUv: number | null;
  /** RS-corrected 256-byte signature, or null if any codeword was uncorrectable. */
  signature: Uint8Array | null;
  /** The 288 codeword bytes as read, before RS correction (diagnostics / parity with the backend). */
  codewords: Uint8Array;
};

/** Read both user-id copies and the signature (extract_frame_v3). Null if the frame is too small for v3. */
export function readFrameV3(frame: YuvFrame): V3FrameReading | null {
  const layout = v3Layout(frame.width, frame.height);
  if (!layout) return null;
  const chromaStride = Math.ceil(frame.width / 2);

  let userIdY: number | null = null;
  try {
    userIdY = decodeYPayloadUserId(frame.y, frame.width, layout.rows, layout.payloadEnd);
  } catch {
    userIdY = null;
  }

  const uvSig: Uint8Array[] = [];
  const blockBits = new Uint8Array(2 * layout.userIdCopiesPerPlane * V3_USER_ID_BLOCK_BITS);
  let blockOffset = 0;
  for (const plane of [frame.u, frame.v]) {
    const bits = qimReadBits(plane, chromaStride, V3_PATCH_UV, layout.rows, 0, layout.cols, layout.uvBits);
    uvSig.push(bits.subarray(0, layout.uvSigCapacity));
    const block = bits.subarray(layout.uvSigCapacity);
    blockBits.set(block, blockOffset);
    blockOffset += block.length;
  }
  const userIdUv = decodeUserIdBlock(blockBits.subarray(0, blockOffset));

  const ySig = qimReadBits(
    frame.y,
    frame.width,
    V3_PATCH_Y,
    layout.rows,
    layout.payloadEnd,
    layout.cols,
    layout.ySigCapacity
  );
  const capacities = [layout.ySigCapacity, layout.uvSigCapacity, layout.uvSigCapacity];
  const sigBits = deinterleaveBits([ySig, uvSig[0], uvSig[1]], capacities);

  return {
    layout,
    userId: userIdUv ?? userIdY,
    userIdY,
    userIdUv,
    signature: bitsToSignature(sigBits),
    codewords: packBitsMsbFirst(sigBits),
  };
}

/** True when the frame carries a valid v3 U/V user-ID block (mode detection: v3 vs v2). */
export function isV3Reading(reading: V3FrameReading | null): reading is V3FrameReading & {userIdUv: number} {
  return !!reading && reading.userIdUv !== null;
}

/** The signed v3 message: UTF-8 "saivd-v3:{frame_count}:{user_id:09d}". */
export function v3Message(frameCount: number | string, userId: number): Uint8Array {
  return new TextEncoder().encode(`saivd-v3:${frameCount}:${String(userId).padStart(9, "0")}`);
}

/** RSASSA-PKCS1-v1_5 / SHA-256 verify of the v3 message with the creator's public key. */
export async function verifyV3Signature(
  publicKey: CryptoKey,
  signature: Uint8Array,
  frameCount: number | string,
  userId: number
): Promise<boolean> {
  return crypto.subtle.verify(
    {name: "RSASSA-PKCS1-v1_5"},
    publicKey,
    signature as BufferSource,
    v3Message(frameCount, userId) as BufferSource
  );
}
