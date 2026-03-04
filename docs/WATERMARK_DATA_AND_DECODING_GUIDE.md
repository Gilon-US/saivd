# Watermark Data and Decoding Guide (Frontend)

This document is the single source of truth for **what data is embedded in watermarked video frames**, **what requires no key** vs **what requires the public RSA key**, and **how the frontend must implement** both decoding flows. It reflects the actual backend process used when `use_patches_2=True` and `watermark_every_n_frames=10` (default).

---

## 1. High-level summary

| What | Where in frame | Key needed? | Frontend action |
|------|----------------|-------------|-----------------|
| **Numeric user ID** (9 digits) | Right region: patch row sums | **No** | Decode from frame 0 (and optionally 10, 20, …) to get `numeric_user_id`. |
| **Message that was signed** | Right region: first 100 row-sum values (same as above, first 100) | **No** | Read the same right-side values; build message string for verification. |
| **RSA signature** (256 bytes) | Left region: 256 slot sums (5-pixel groups) | **Yes (public key)** | Extract 256 bytes; use public key to **verify** signature over message. |

- **Nothing is encrypted.** The right-side values (including the user ID pattern and the “message”) are **plain**. The public key is used only to **verify** that the 256-byte signature (left side) is a valid RSA signature over the first 100 right-side values.
- **Which frames:** Frames **0, 10, 20, 30, …** are watermarked. Each has both the user ID pattern (right) and the signature (left). All other frames are unchanged.

---

## 2. Frame layout (what is stored where)

### 2.1 Two regions: right (message + user ID) and left (signature)

- **Right region:** Patch columns `0` through `right_end_index - 1` of the **patch matrix** (16×16 block means of the Y/luma channel). From this region the backend (and frontend) compute **one value per patch row**: the sum of that row over those columns (with factor 1, no division). That 1D array is called **right_side**.
- **Left region:** Pixel columns from `right_end_index * 16` to the end of the frame. The backend (and frontend) form **256 “slots”**: each slot is the sum of 5 consecutive pixels in one column, in column-major order. Those 256 values are the **signature bytes** (0–255).

So in every watermarked frame (0, 10, 20, …):

- **right_side** = row sums over the right patch columns → carries the **user ID pattern** (first 9×reps digits) and the **signed message** (first 100 values).
- **left_side** = 256 slot sums → the **RSA signature** (256 bytes).

### 2.2 Right side: user ID (no key) and signed message (no key to read; key to verify)

- The backend encodes the **numeric user ID** as a 9-digit, zero-padded decimal string (e.g. `1` → `"000000001"`). Each digit (0–9) is repeated `repsUsed` times (`repsUsed = min(7, floor(rightSide.length / 9))`). The rest of the right_side is padding (zeros).
- So the **same** right_side array contains:
  1. **User ID pattern:** The first `9 * repsUsed` values are the 9 digits repeated. The frontend decodes the **numeric user ID** from this **without any key** (see §4).
  2. **Signed message:** The **first 100 values** of right_side (as a string: each value is one character, code point = that value) are the exact **message** the backend signed with the **client’s private key**. The frontend builds this string from the same right_side **without any key**. The key is needed only to **verify** that the left-side signature is valid for this message (see §5).

Important: the backend uses **local_private_key=None** when embedding. So the right-side values are **not** obfuscated or encrypted; they are plain row sums that equal the pattern (user ID + padding). Reading them does not require any key.

**Backend behavior (right side, frame 0):** The backend **does not use the RSA key for the right side on frame 0** (or on other watermarked frames 0, 10, 20, …). The right-side values are therefore plain, and the **user ID can be extracted without a key**. The frontend decode flow relies on this design.

### 2.3 Left side: RSA signature (public key needed only for verification)

- The backend takes the **message** = string of the first 100 right_side values (each value → one character).
- It signs that message with the **client’s private key** (RSASSA-PKCS1-v1_5, SHA-256), producing a **256-byte signature**.
- It embeds that signature into the **left region** by adjusting 5-pixel groups so that each of the 256 slot sums equals the corresponding signature byte (0–255).
- The frontend **extracts** the 256 bytes from the left region (no key needed to read the pixels). It then uses the **public key** to **verify** that this 256-byte signature is valid for the message (first 100 right_side values). The public key is **not** used to “decrypt” anything; it is used only for **signature verification**.

---

## 3. Which frames are watermarked

- Backend parameter: `watermark_every_n_frames=10` (default).
- Watermarked frame indices: **0, 10, 20, 30, …** (i.e. `frame_index % 10 === 0`).
- Each of these frames contains:
  - **Right region:** User ID pattern + the signed message (first 100 right_side values).
  - **Left region:** 256-byte RSA signature.

So:

- **Decode user ID (no key):** Use **frame 0 only**. The backend embeds the unencrypted user ID (plain right side) only on frame 0 so the player (and third-party players) can extract the user ID and fetch the RSA public key via API. Frames 10, 20, … have the right side encrypted, so user ID cannot be extracted from them without the private key.
- **Verify with public key:** Use **frame 0 and every tenth frame (10, 20, 30, …)**. Once the public key is obtained, the frontend verifies each watermarked frame using the RSA key (build message from right side, extract signature from left, verify). Only the **user ID extraction** is keyless and only on frame 0; all other frame verifications use the RSA key.

---

## 4. Step 1: Decode numeric user ID from frame 0 (no key)

Goal: From **frame 0** (or any watermarked frame), obtain `numeric_user_id` without using any key.

1. **Get luma (Y)** for the frame (e.g. from canvas; use the same luma formula as the backend, e.g. BT.709: `Y = 0.2126*R + 0.7152*G + 0.0722*B`). Crop to multiples of 16: `W' = W - (W % 16)`, `H' = H - (H % 16)`.
2. **Build patch matrix:** 16×16 blocks; each cell = rounded mean of that block. Shape `(H'/16, W'/16)`.
3. **Right region indices:**
   - `groups_per_column = floor(H' / 5)` (integer)
   - `num_left_columns = ceil(256 / groups_per_column)` = `(256 + groups_per_column - 1) / groups_per_column` (integer)
   - `right_end_index = (W'/16) - num_left_columns` (number of patch columns in the right region)
4. **Right-side row sums (factor 1):**  
   `rightSide[row] = sum(patch_matrix[row, 0 : right_end_index])`  
   No division; factor = 1.
5. **Decode user ID from pattern:**
   - `repsUsed = min(7, floor(rightSide.length / 9))`
   - Take first `9 * repsUsed` values of `rightSide`.
   - Split into 9 groups of `repsUsed` values. For each group, **mode** (most frequent value 0–9) = one digit.
   - Concatenate the 9 digits → `digitStr` (e.g. `"000000001"`, `"920000001"`).
   - `numeric_user_id = parseInt(digitStr, 10)`. Do not strip trailing zeros.

No key is used in this step. The right-side values are plain.

---

## 5. Step 2: Fetch public key and verify (frame 0 and every 10th frame)

Goal: Prove that the frame’s watermark was produced by the holder of the private key for the decoded `numeric_user_id`. This uses the **public RSA key** only for **verification**, not for reading or decrypting data.

1. **Fetch public key:** Call the **Next.js application API** (not the watermarking service) with the decoded `numeric_user_id` (e.g. `GET /api/users/{numeric_user_id}/public-key`). Obtain the public key in PEM form and import it (e.g. Web Crypto: `crypto.subtle.importKey(..., 'RSASSA-PKCS1-v1_5', hash 'SHA-256', ..., ['verify'])`).

2. **From the same frame (0, 10, 20, …):**
   - Compute **right_side** exactly as in §4 (same patch matrix, same right_end_index, same row sums, factor 1).
   - **Message (what was signed):**  
     `message = right_side.slice(0, 100).map(v => String.fromCharCode(v)).join('')`  
     Encode this string to bytes (e.g. UTF-8) for the verify call. The backend signs `message.encode()` (UTF-8).
   - **Signature (256 bytes):** From the **left region** (pixel columns starting at `right_end_index * 16`), build the 256 slot sums (each slot = sum of 5 consecutive pixels in one column, column-major). Each value is one signature byte (0–255). Order: first 256 such sums.

3. **Verify:**  
   `crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, publicKey, signatureBuffer, messageBuffer)`  
   where `signatureBuffer` is the 256-byte signature and `messageBuffer` is the UTF-8-encoded message string.

If verification succeeds, the frame’s watermark is valid for that user. You can repeat for frames 10, 20, … with the same public key.

---

## 6. What is and is not encoded with the RSA key

- **Not encoded (not encrypted) with the RSA key:**
  - The **numeric user ID** (9-digit pattern in the right side).
  - The **message** (first 100 right_side values as string). You can read both without any key.

- **Encoded with the client’s private key (and verified with the public key):**
  - The **RSA signature** (256 bytes) is produced by **signing** the message with the client’s private key. The signature is **stored** in the left region (as 256 slot sums). The frontend uses the **public key only to verify** that this signature matches the message. So:
  - **Private key (backend/client):** signs the message → 256-byte signature.
  - **Public key (frontend):** used to **verify** that the extracted 256-byte signature is valid for the extracted message. No decryption of the right side; the right side is always plain.

---

## 7. End-to-end frontend flow (concise)

1. **Frame 0:** Get Y (luma), crop to multiple of 16, build patch matrix.
2. **Right region:** Compute `right_end_index` and right-side row sums (factor 1) → `rightSide`.
3. **Decode user ID (no key):** From `rightSide`, compute `repsUsed`, take first `9*repsUsed` values, 9 groups, mode per group → 9 digits → `numeric_user_id = parseInt(digitStr, 10)`.
4. **Fetch public key:** Call Next.js API with `numeric_user_id`; import PEM as `CryptoKey` for verify.
5. **Verify frame 0 (and optionally 10, 20, …):**
   - Message: `right_side.slice(0, 100)` → string (each value = char code) → UTF-8 bytes.
   - Signature: left region → 256 slot sums (5-pixel groups, column-major) → 256 bytes.
   - `crypto.subtle.verify(..., publicKey, signatureBytes, messageBytes)`.

---

## 8. Constants (must match backend)

| Constant | Value |
|----------|--------|
| Patch size | 16 |
| Factor for row sums | 1 |
| Message length (signed) | 100 values |
| Signature length | 256 bytes |
| User ID digits | 9 |
| Reps (max) | 7; `repsUsed = min(7, floor(rightSide.length / 9))` |
| RSA padding | PKCS1v15 |
| Hash | SHA-256 |
| Watermarked frames | 0, 10, 20, … (`frame_index % 10 === 0`) |

---

## 9. Backend references (this repo)

- **Right/left layout, pattern, signature embedding:** `watermark_y_patches_2` in `watermark_video/watermark_call_function.py`.
- **User ID pattern (9 digits, reps):** `return_pattern_user_id_reps` in `watermark_video/utils.py`.
- **Message and signature:** `digital_sign_right_side`, `rsa_digital_sign` in `watermark_video/encryption_utils.py` (message = first 100 right_side values as string; sign with PKCS1v15 + SHA-256).
- **Column sums (right side):** `create_column_sums` in `watermark_video/utils.py` (with `local_private_key=None` at embed time, so no obfuscation).
- **Extraction (backend):** `extract_user_id_from_y_channel` in `watermark_video/watermark_call_function.py`.

---

## 10. Related docs

- **Frame layout and verification details:** `docs/FRONTEND_WATERMARK_VERIFICATION_SPEC.md`.
- **9-digit decode and luma:** `docs/FRONTEND_USER_ID_DECODE_UPDATE.md`, `docs/FRONTEND_WATERMARK_VERIFICATION_FIX.md`.
