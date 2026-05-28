/**
 * In-browser verifier for the SAIVD image watermark format (v1).
 *
 * Implements `saivd-viewer/docs/IMAGE_WATERMARK_SPEC.md` §6 byte-for-byte.
 * Independent of `watermark-verification.ts` (the V2 video verifier) because
 * the image format is a different algorithm — see the spec doc §9 for the
 * side-by-side.
 *
 * Public surface:
 *
 *   - {@link decodeNumericUserIdFromImage}: no key, returns numeric_user_id
 *   - {@link verifyImageWatermark}: fetches public key, runs RSA verify
 *   - {@link importRsaPublicKeyForVerify}: shared key import helper
 *
 * The decoder MUST run on the full-resolution image (intrinsic dimensions),
 * not a styled DOM element. Caller passes an `ImageBitmap` produced via
 * `createImageBitmap(blob)` or `createImageBitmap(<img>)`.
 */

// --- Spec constants — must match watermark_image.embed + IMAGE_WATERMARK_SPEC.md §8.
const RSA_LEN = 256;
const USER_ID_DIGITS = 9;
const SIGNED_MESSAGE_LENGTH = 100;

export type ImageVerificationFailReason =
  | "no_watermark"
  | "invalid_signature"
  | "malformed"
  | "fetch_failed";

export type ImageVerificationOk = {
  ok: true;
  numericUserId: number;
};

export type ImageVerificationFail = {
  ok: false;
  reason: ImageVerificationFailReason;
  detail?: string;
};

export type ImageVerificationResult = ImageVerificationOk | ImageVerificationFail;

// ---------------------------------------------------------------------------
// Low-level decode (no key) — used by both decode-only and verify paths.
// ---------------------------------------------------------------------------

type DecodedRegions = {
  width: number;
  height: number;
  rightSide: Int32Array; // length H - RSA_LEN
  leftSide: Int32Array; // length RSA_LEN
};

function imageBitmapToBlueRowSums(bmp: ImageBitmap): DecodedRegions | {error: string} {
  const W = bmp.width;
  const H = bmp.height;
  if (W < RSA_LEN || H < RSA_LEN + USER_ID_DIGITS) {
    return {error: `image too small (${W}x${H}); need W>=${RSA_LEN} and H>=${RSA_LEN + USER_ID_DIGITS}`};
  }
  // OffscreenCanvas is widely supported; fall back to a regular canvas if not.
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (typeof OffscreenCanvas !== "undefined") {
    const oc = new OffscreenCanvas(W, H);
    ctx = oc.getContext("2d") as OffscreenCanvasRenderingContext2D;
  } else {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    ctx = c.getContext("2d") as CanvasRenderingContext2D;
  }
  if (!ctx) return {error: "could not get 2d context"};
  ctx.drawImage(bmp, 0, 0);
  const {data} = ctx.getImageData(0, 0, W, H);

  // Per-row sums of B channel (canvas RGBA index 2 = encoder BGR index 0) mod W.
  const rowSums = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    const base = y * W * 4;
    for (let x = 0; x < W; x++) {
      s += data[base + x * 4 + 2];
    }
    rowSums[y] = s % W;
  }
  const rightSide = rowSums.slice(0, H - RSA_LEN);
  const leftSide = rowSums.slice(H - RSA_LEN);
  return {width: W, height: H, rightSide, leftSide};
}

/**
 * Decode the embedded numeric_user_id from a watermarked image. Does NOT
 * verify the signature — use {@link verifyImageWatermark} for that.
 *
 * Returns null if the first USER_ID_DIGITS cells aren't all in [0, 9],
 * which is a strong indicator the image is not watermarked.
 */
export function decodeNumericUserIdFromImage(bmp: ImageBitmap): number | null {
  const decoded = imageBitmapToBlueRowSums(bmp);
  if ("error" in decoded) return null;
  const digits = Array.from(decoded.rightSide.subarray(0, USER_ID_DIGITS));
  if (digits.some((d) => d < 0 || d > 9)) return null;
  const numeric = parseInt(digits.join(""), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

// ---------------------------------------------------------------------------
// Public key fetch (shared shape with video verifier; uses same endpoint).
// ---------------------------------------------------------------------------

const PUBLIC_KEY_CACHE: Map<number, Promise<CryptoKey>> = new Map();

export async function fetchImagePublicKey(numericUserId: number): Promise<CryptoKey> {
  const cached = PUBLIC_KEY_CACHE.get(numericUserId);
  if (cached) return cached;

  const promise = (async () => {
    const res = await fetch(`/api/users/${numericUserId}/public-key`, {credentials: "include"});
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `public_key_fetch_failed: ${res.status}`);
    }
    const data = await res.json();
    const pem: string | undefined = data?.data?.public_key_pem;
    if (!pem) throw new Error("public_key_fetch_failed: missing public_key_pem");
    return importRsaPublicKeyForVerify(pem);
  })();

  PUBLIC_KEY_CACHE.set(numericUserId, promise);
  // Evict on failure so a subsequent call retries.
  promise.catch(() => PUBLIC_KEY_CACHE.delete(numericUserId));
  return promise;
}

export async function importRsaPublicKeyForVerify(pem: string): Promise<CryptoKey> {
  const trimmed = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(trimmed);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    "spki",
    buffer,
    {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"},
    false,
    ["verify"]
  );
}

// ---------------------------------------------------------------------------
// Full verify
// ---------------------------------------------------------------------------

/**
 * Verify a watermarked image end-to-end:
 *   1. Read pixels → row sums.
 *   2. Decode numeric_user_id (no key).
 *   3. Fetch public key from /api/users/{numericUserId}/public-key.
 *   4. RSA-verify the bottom-256-rows signature against the
 *      first-100-cells message.
 */
export async function verifyImageWatermark(
  bmp: ImageBitmap,
  options?: {
    /** Pre-resolved public key to skip the fetch (used by tests and for
     *  re-verifying multiple images of the same user). */
    publicKey?: CryptoKey;
  },
): Promise<ImageVerificationResult> {
  const decoded = imageBitmapToBlueRowSums(bmp);
  if ("error" in decoded) {
    return {ok: false, reason: "malformed", detail: decoded.error};
  }
  const {rightSide, leftSide} = decoded;

  const digits = Array.from(rightSide.subarray(0, USER_ID_DIGITS));
  if (digits.some((d) => d < 0 || d > 9)) {
    return {ok: false, reason: "no_watermark", detail: `digits out of range: ${digits.join(",")}`};
  }
  const numericUserId = parseInt(digits.join(""), 10);
  if (!Number.isFinite(numericUserId)) {
    return {ok: false, reason: "no_watermark", detail: "could not parse user_id"};
  }

  let publicKey: CryptoKey;
  try {
    publicKey = options?.publicKey ?? (await fetchImagePublicKey(numericUserId));
  } catch (e) {
    return {ok: false, reason: "fetch_failed", detail: e instanceof Error ? e.message : String(e)};
  }

  // Message: first 100 right_side cells, code-point-encoded then UTF-8.
  const messageChars: number[] = [];
  for (let i = 0; i < SIGNED_MESSAGE_LENGTH; i++) {
    messageChars.push(rightSide[i]);
  }
  const messageStr = String.fromCharCode(...messageChars);
  const messageBuf = new TextEncoder().encode(messageStr);

  // Signature: 256 bytes, one per row sum in the bottom region.
  const signatureBuf = new Uint8Array(RSA_LEN);
  for (let i = 0; i < RSA_LEN; i++) signatureBuf[i] = leftSide[i] & 0xff;

  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      {name: "RSASSA-PKCS1-v1_5"},
      publicKey,
      signatureBuf,
      messageBuf,
    );
  } catch (e) {
    return {ok: false, reason: "malformed", detail: e instanceof Error ? e.message : String(e)};
  }
  if (!ok) return {ok: false, reason: "invalid_signature"};
  return {ok: true, numericUserId};
}
