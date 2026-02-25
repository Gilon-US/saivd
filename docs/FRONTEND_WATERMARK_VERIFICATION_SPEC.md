# Frontend Watermark Verification Spec

This document is the implementation contract for client-side decoding and RSA verification of watermarked video frames. It is intended for frontend developers and AI coding tools. The **watermarking service** (this repository) only performs encoding; the **Next.js application** (separate repository) provides the public RSA key and other user/API endpoints.

---

## 1. Overview

### Goal

- Decode `numeric_user_id` from **frame 0** (no key required).
- Fetch the creator’s **public RSA key** from the **Next.js application API** (not from the watermarking service).
- Verify **frame 0** and every 10th frame (0, 10, 20, …) using the public key, with no further backend calls after the single key fetch.

### Prerequisites

- Video was watermarked by the watermarking service with **use_patches_2=True** (default). Frames 0, 10, 20, … then contain:
  - **Right side:** plain user_id pattern (column sums, no RSA obfuscation).
  - **Left side:** 256-byte RSA signature (PKCS1v15 + SHA-256) over the first 100 right-side values.

### Architecture

- **Watermarking service (this repo):** Encodes video only. Does not store keys or user data; does not expose a public-key endpoint.
- **Next.js application (separate repo):** Stores user data and RSA keys. Frontend must call the Next.js app’s API to obtain the public key for a given `numeric_user_id`.

---

## 2. Frame layout (must match backend)

All coordinates and formulas below must match the watermarking service so that the frontend can decode and verify correctly.

### Frame dimensions

- Frame must have height and width that are multiples of **16**. If not, crop to `(H - H % 16)` and `(W - W % 16)` before processing.

### Patch step (16×16 blocks)

- Split the Y (luma) frame into 16×16 blocks.
- **Given frame (patch matrix):** 2D array of shape `(H/16, W/16)`. Each cell is the **mean** of the corresponding 16×16 block, rounded: `(mean + 0.5) | 0` (integer).
- In NumPy terms: `patches = frame.reshape(h/16, 16, w/16, 16).transpose(0, 2, 1, 3)` then `given_frame = (patches.mean(axis=(2,3)) + 0.5).astype(int)`.
- Backend reference: `patch_frame` in `watermark_video/watermark_call_function.py`.

### Right side (message + user_id pattern)

- **Layout:** The patch matrix is split into a “right” and “left” region. The **right** region holds the user_id pattern and the message that was signed.
- **Indices:**
  - `H` = full frame height (after crop to multiple of 16).
  - `groups_per_column = H // 5`.
  - `num_left_columns = ceil(256 / groups_per_column)` = `(256 + groups_per_column - 1) // groups_per_column`.
  - `right_end_index = given_frame.shape[1] - num_left_columns` (patch column index; number of patch columns in the right region).
- **Column sums:** For the **right** region only (patch columns `0` to `right_end_index - 1`), sum each **row** of the patch matrix. Result is a 1D array `right_side` of length `right_end_index`.
  - Formula: `right_side[row] = sum(given_frame[row, 0:right_end_index])`.
  - **Factor:** Use factor **1** (i.e. no division). Backend uses `create_column_sums(..., factor=1)`.
- Backend reference: `watermark_y_patches_2` in `watermark_video/watermark_call_function.py` (right_side, right_end_index, create_column_sums with factor).

### Left side (signature, 256 bytes)

- **Pixel region:** Pixel columns starting at `left_start_col = right_end_index * 16` to the end of the frame. So `left_frame = full_frame[:, left_start_col:]` (full pixel frame, not the patch matrix).
- **256 slots:** Each slot is the **sum of 5 consecutive pixels** in a single column. Order is **column-major**: for each column in `left_frame`, take groups of 5 rows (rows 0–4, 5–9, …), and sum the 5 pixel values. Collect these sums in order until you have 256 values.
  - Pseudocode:
    - `left_side = []`
    - For each column `col` in `left_frame`:
      - For `group_start = 0, 5, 10, ...` while `group_start + 5 <= height`:
        - `left_side.push(sum(left_frame[group_start:group_start+5, col]))`
    - Take the first **256** values: `left_side = left_side.slice(0, 256)`.
- **Signature bytes:** After embedding, each slot sum equals the corresponding signature byte (0–255). Treat each value as a byte (clamp to 0–255 if needed). The resulting 256 bytes form the RSA signature.
- Backend reference: same function, “Create left_side sums from 5-pixel groups” and `left_side = np.array(left_side[:256])`.

---

## 3. Decoding numeric_user_id from frame 0 (no key)

- Use **frame 0** only for decoding the user_id.
- Compute the patch matrix and **right side** column sums as in §2, with **factor=1** and **no RSA** (the backend uses `local_private_key=None`, so no additions to column sums).
- **Pattern:** The backend encodes the 9-digit user_id with **repetition**. Each digit is repeated **reps=7** times. So the first `9 * 7 = 63` values in `right_side` encode the 9 digits (each digit 0–9 repeated 7 times); remaining values are padding (zeros).
- **Decode:**
  1. Take the first 63 values (or more generally, `9 * reps` with `reps = 7`).
  2. Reshape into groups of 7: `[[v0..v6], [v7..v13], ...]`.
  3. For each group, take the **mode** (most frequent value); that is the digit for that position.
  4. Concatenate the 9 digits to form a string and parse as integer: `numeric_user_id`.
- **Constants:** 9 digits, `reps = 7`, pattern values in 0..9.
- Backend reference: `return_pattern_user_id_reps` in `watermark_video/utils.py`, and `extract_user_id_from_y_channel` in `watermark_video/watermark_call_function.py` (mode over reps).

---

## 4. RSA verification (frames 0, 10, 20, …)

### Message (what was signed)

- The backend signs the first **100** column-sum values of the **right side** as a string: each value is one character (code point = that value).
- **Message string:** `message = right_side.slice(0, 100).map(v => String.fromCharCode(v)).join('')`.
- **Message bytes for verification:** Encode this string to bytes (e.g. UTF-8) for the verify call. The backend uses `message.encode()` (Python default UTF-8).

### Signature

- **256 bytes** from the left side, as in §2: the 256 slot sums, each clamped to 0..255, in order.

### Algorithm

- **RSA:** RSASSA-PKCS1-v1_5.
- **Hash:** SHA-256.
- Backend: `padding.PKCS1v15()`, `hashes.SHA256()` in `watermark_video/encryption_utils.py` and `watermark_video/utils.py`.

### Web Crypto usage

1. **Import public key from PEM:** The Next.js application returns the public key in PEM format. Strip the PEM header/footer and newlines, base64-decode to a binary buffer, then:
   - `crypto.subtle.importKey('spki', buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])`.
2. **Verify:** `crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, publicKey, signatureBuffer, messageBuffer)` where `signatureBuffer` is the 256-byte signature and `messageBuffer` is the UTF-8-encoded message string.
- PEM is returned by the **Next.js application API**, not by the watermarking service. Use the Next.js repo or frontend API docs for the exact response shape (e.g. JSON with `public_key_pem` or raw PEM).

---

## 5. Public key API (Next.js application, not this repo)

- The **public RSA key** (and other user/non-encoding APIs) is **not** provided by the watermarking service. The frontend must obtain the public key from the **Next.js application** (separate repository), which stores user data and RSA keys.
- Call the Next.js app’s API with the decoded `numeric_user_id` (e.g. something like `GET /api/users/{numeric_user_id}/public-key` or equivalent as defined in the Next.js repo). The response is expected to be PEM or JSON containing `public_key_pem` so the frontend can import the key for verification.
- This repo does **not** define the Next.js API contract. The frontend spec here only states that the “Next.js application API for public key by user id” must be used; the exact endpoint and response shape are defined in the Next.js repository or the frontend app’s API documentation.
- Call the public-key API **once** after decoding `numeric_user_id` from frame 0; then verify frame 0 and any other verification frames (10, 20, …) locally with that key.

---

## 6. End-to-end flow (pseudocode)

1. Get **frame 0** Y (luma), e.g. via WebCodecs or canvas (convert to grayscale with same luma formula as backend if needed).
2. Decode **numeric_user_id** from frame 0: patch matrix → right side column sums → pattern decode (reps=7, mode per digit, 9 digits).
3. Fetch **public key** for `numeric_user_id` from the **Next.js application API** (not the watermarking service). Parse PEM to a `CryptoKey` (Web Crypto).
4. For **frame 0** (and optionally frames 10, 20, …): compute right_side and left_side (signature), build message string from first 100 right_side values, encode message to bytes, then run RSA verify with the public key and the 256-byte signature.
5. If verification succeeds for frame 0 (and optionally for additional frames), show “Verified”.

---

## 7. Constants and compatibility

| Constant            | Value        |
|---------------------|-------------|
| Patch size          | 16          |
| Factor              | 1           |
| MAX_MESSAGE_LENGTH  | 100         |
| Signature length    | 256 bytes   |
| User ID digits      | 9           |
| Reps (for pattern)  | 7           |
| RSA padding         | PKCS1v15    |
| Hash                | SHA-256     |

- The backend uses **watermark_y_patches_2** and **local_private_key=None**, so the right side is not RSA-obfuscated and can be read directly for user_id and for the signed message.

---

## 8. References (backend, this repo)

Authoritative formulas and behavior are implemented in:

- `watermark_video/watermark_call_function.py`: `patch_frame`, `watermark_y_patches_2`, `extract_user_id_from_y_channel`
- `watermark_video/utils.py`: `create_column_sums`, `return_pattern_user_id_reps`, `left_side_encryption_check_failed`
- `watermark_video/encryption_utils.py`: `digital_sign_right_side`, `rsa_digital_sign` (PKCS1v15, SHA-256)

Use these for any ambiguity when implementing the frontend decoding and verification logic.
