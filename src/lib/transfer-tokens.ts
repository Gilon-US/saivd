/**
 * Token utilities for the cross-app video transfer feature.
 *
 * Tokens are 256-bit url-safe base64 strings (43 chars after `=` stripping).
 * Only sha256(token) is persisted; the plaintext is returned to the creator
 * exactly once, at the moment of share-link generation. Comparison happens by
 * hashing the incoming token and looking up by `token_hash` in the DB.
 *
 * Why sha256 (and not bcrypt/scrypt)?
 *   - Tokens are high-entropy random bytes, so brute-force is not the threat
 *     model — collision/leak is. A constant-time hash like sha256 gives O(1)
 *     lookup via a unique index, which bcrypt cannot.
 *   - We're not authenticating users, we're validating opaque opaque-by-design
 *     references. Same reasoning Stripe uses for session_id, GitHub uses for
 *     release asset URLs, etc.
 */

import {createHash, randomBytes} from "node:crypto";

/** Number of random bytes before encoding. 32 bytes = 256 bits. */
const TOKEN_BYTE_LENGTH = 32;

/**
 * Generate a fresh transfer token.
 * @returns plaintext token (url-safe base64, no padding) — return to the
 *   creator only, never persist.
 */
export function generateTransferToken(): string {
  return randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");
}

/**
 * Hash a token for storage / lookup. Deterministic — calling this with the
 * same input always returns the same output, which is what we want for the
 * unique-index lookup.
 */
export function hashTransferToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/**
 * Sanity-check a token shape before doing a DB lookup. Cheap defense against
 * obviously-malformed inputs (and lets the public endpoint return a uniform
 * 404 for both invalid-shape and not-found, no enumeration leak).
 */
export function isPlausibleTransferToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{30,128}$/.test(value);
}
