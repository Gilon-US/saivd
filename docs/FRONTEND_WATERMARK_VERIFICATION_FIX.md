# Frontend: Fix for Consistent Watermarked Video Playback and Verification

This document describes the changes the frontend must make so that **watermark verification (user ID decode and RSA verification) works consistently** for all watermarked videos, regardless of resolution or source. It is intended for use with an AI coding tool or frontend developer.

---

## 1. Problem Summary

- **Symptom:** Some watermarked videos verify successfully (user ID decodes, playback allowed); others fail with "invalid mode for digit" (e.g. mode 76) and `numericUserId: null`, so verification fails and playback may be blocked or degraded.
- **Root cause:** The backend embeds the watermark in the **Y (luma)** channel only. The frontend captures the video frame from a canvas, which provides **RGB** pixels. If the frontend builds the patch matrix and right-side sums from **RGB** (e.g. a single channel or `(R+G+B)/3`) instead of from **luma Y** using the same formula the video codec uses, the computed values do not match what the backend wrote. Decode then produces values outside 0–9 (e.g. 76, 81), so the mode is invalid.
- **Why it appears resolution-dependent:** Videos with **more patch rows** (e.g. 1920×1080 → 67 rows) get **more repetitions per digit** (`repsUsed = 7`). The mode of each group can still be 0–9 even when many values are wrong (majority wins). Videos with **fewer patch rows** (e.g. 1494×836 → 52 rows) get **fewer repetitions** (`repsUsed = 5`). The same level of wrong values can make the mode fall outside 0–9 (e.g. 76), so decode fails. Fixing the luma derivation makes the values match the backend so **all** resolutions verify consistently.

---

## 2. Requirements (What Must Match the Backend)

The backend (this repo) does the following. The frontend must replicate it exactly for the frame it captures.

| Step | Backend behavior | Frontend must |
|------|------------------|----------------|
| Input | Raw **Y** (luma) from FFmpeg `yuv420p` decode | Derive **Y** from canvas RGB using a standard luma formula (see below) |
| Crop | Crop to multiples of 16: `W' = W - (W % 16)`, `H' = H - (H % 16)` | Same crop before building patches |
| Patch matrix | 16×16 block **means** of Y, rounded: `(mean + 0.5) \| 0` | Same: shape `(H'/16, W'/16)`, each cell = rounded mean of 16×16 Y block |
| Right region | `right_end_index = patch_cols - num_left_columns` where `num_left_columns = ceil(256 / (H'/5))` | Same formula |
| Right-side sums | For each patch **row**, sum patch values in columns `0..right_end_index-1`. **Factor = 1** (no division). | `rightSide[row] = sum(given_frame[row, 0..right_end_index-1])`; no division |
| User ID pattern | First `9 * repsUsed` values of `rightSide` are 9 digits (0–9) repeated `repsUsed` times | Decode with `repsUsed = min(7, floor(rightSide.length/9))`, mode per group, 9 digits, `parseInt(digitStr, 10)` |

If any of these differ (especially using RGB instead of Y), verification will be unreliable.

---

## 3. Implementation: Derive Luma (Y) From Canvas RGB

The browser draws the video to a canvas and returns pixels in **RGB** (e.g. `ImageData` with `data[i]=R, data[i+1]=G, data[i+2]=B`). You must convert each pixel to a single **luma Y** value so that the patch means match the backend’s Y patch means.

### 3.1 Luma formula

Use one of the following. **BT.709** is recommended for typical web/video content; **BT.601** is a common fallback. Be consistent.

- **BT.709 (recommended):**
  ```ts
  Y = Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B);
  ```
- **BT.601:**
  ```ts
  Y = Math.round(0.299 * R + 0.587 * G + 0.114 * B);
  ```

Clamp the result to `[0, 255]` if needed. The backend uses integer Y in that range.

### 3.2 Build a Y-only frame from ImageData

For each pixel in the canvas:

1. Read `R = data[i]`, `G = data[i+1]`, `B = data[i+2]`.
2. Compute `Y = 0.2126*R + 0.7152*G + 0.0722*B` (or BT.601).
3. Store `Y` (e.g. in a `Uint8Array` or 2D array of shape `height × width`).

Result: a 2D luma frame of dimensions `width × height` (same as the canvas after crop). All subsequent steps (crop to mod16, patches, right-side) must use this **Y** frame, not R, G, B, or (R+G+B)/3.

---

## 4. Implementation: Canvas Dimensions and Crop

- Set the canvas size to the **video’s intrinsic dimensions** (e.g. `video.videoWidth`, `video.videoHeight`) so that one canvas pixel corresponds to one video pixel. Do **not** use the video’s display/CSS size if it is scaled.
- Crop the Y frame to multiples of 16:
  ```ts
  const cropW = videoWidth - (videoWidth % 16);
  const cropH = videoHeight - (videoHeight % 16);
  // Use Y pixels in [0, cropH) and [0, cropW) only.
  ```
- Build the patch matrix from this cropped Y frame of size `cropW × cropH`.

---

## 5. Implementation: Patch Matrix From Y

- **Patch matrix dimensions:** `patchRows = cropH / 16`, `patchCols = cropW / 16`.
- For each 16×16 block, compute the **mean** of the 256 Y values in that block, then **round**: `(mean + 0.5) | 0` (integer).
- Order of blocks: row-major. Block at `(r, c)` covers pixel rows `r*16 .. (r+1)*16 - 1` and columns `c*16 .. (c+1)*16 - 1`.
- Result: 2D array `given_frame` (or `patchMatrix`) of shape `(patchRows, patchCols)` with integer values in `[0, 255]`.

Pseudocode:

```ts
const patchRows = cropH / 16;
const patchCols = cropW / 16;
const givenFrame = []; // or typed array of shape (patchRows * patchCols)
for (let r = 0; r < patchRows; r++) {
  for (let c = 0; c < patchCols; c++) {
    let sum = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        sum += yFrame[(r * 16 + y) * cropW + (c * 16 + x)];
      }
    }
    givenFrame[r * patchCols + c] = Math.round(sum / 256 + 0.5);
  }
}
```

---

## 6. Implementation: Right-Side Column Sums

- **Right-end index (patch columns):**
  ```ts
  const groupsPerColumn = Math.floor(cropH / 5);
  const numLeftColumns = Math.ceil(256 / groupsPerColumn);
  const rightEndIndex = patchCols - numLeftColumns;
  ```
- **Right-side (row sums over the right region only):** For each patch **row** `r`, sum the patch values in columns `0` to `rightEndIndex - 1`. Use **factor 1** (no division).
  ```ts
  const rightSide = [];
  for (let r = 0; r < patchRows; r++) {
    let sum = 0;
    for (let c = 0; c < rightEndIndex; c++) {
      sum += givenFrame[r * patchCols + c];
    }
    rightSide.push(sum);
  }
  ```
- `rightSide.length` must equal `patchRows`. This is the same vector the backend uses for the user-id pattern and for the RSA message.

---

## 7. Implementation: Decode Numeric User ID From rightSide

- Use **frame 0** only for user ID decode.
- **repsUsed:** `const repsUsed = Math.min(7, Math.floor(rightSide.length / 9));`
- **Usable length:** `const usable = 9 * repsUsed;`  
  Take `rightSide.slice(0, usable)`.
- **Reshape into 9 groups** of `repsUsed` values:  
  Group `d` (digit index 0..8): values at indices `d*repsUsed .. (d+1)*repsUsed - 1`.
- **Digit per group:** For each group, compute the **mode** (most frequent value). That value must be in **0–9**; if it is not (e.g. 76), the implementation is wrong (usually luma or patch formula).
- **digitStr:** Concatenate the 9 digits: `digitStr = digits.join('')` (e.g. `"000000001"`).
- **Parse:** `numericUserId = parseInt(digitStr, 10)`. **Do not strip trailing zeros** from `digitStr`; leading zeros are fine.

Example (conceptually):

```ts
const repsUsed = Math.min(7, Math.floor(rightSide.length / 9));
const usable = 9 * repsUsed;
const values = rightSide.slice(0, usable);
const digits = [];
for (let d = 0; d < 9; d++) {
  const group = values.slice(d * repsUsed, (d + 1) * repsUsed);
  const mode = computeMode(group); // most frequent value in group
  if (mode < 0 || mode > 9) return null; // invalid: check luma/patch pipeline
  digits.push(mode);
}
const digitStr = digits.join('');
const numericUserId = parseInt(digitStr, 10);
```

---

## 8. Validation and Debugging

- **Sanity check:** After building `rightSide` from **Y** and the correct patch/right-end logic, the first `9*repsUsed` values should be **mostly** in 0–9 (the pattern is 9 digits repeated). If you see many values in the 50–120 range or similar, the frontend is not using the same Y as the backend (e.g. still using RGB or wrong luma formula).
- **Mode check:** If `computeMode(group)` returns a value &gt; 9, do **not** treat it as a valid digit; treat decode as failed and fix the pipeline (luma, crop, patch rounding, right-side sum).
- **Resolution:** Ensure the canvas used for `getImageData` is exactly `video.videoWidth × video.videoHeight` (or the same crop you use for backend alignment). Avoid drawing the video scaled into a different-sized canvas for the frame you analyze.

---

## 9. RSA Verification (Unchanged Logic)

Once `rightSide` is correct (from Y and the steps above), RSA verification can follow the existing spec:

- **Message:** First 100 values of `rightSide`, as string: `message = rightSide.slice(0, 100).map(v => String.fromCharCode(v)).join('')`.
- **Signature:** 256 bytes from the left side (5-pixel groups, column-major), clamped to 0–255.
- **Verify** with the public key (RSASSA-PKCS1-v1_5, SHA-256) against the UTF-8-encoded message.

If the frontend was using wrong values for `rightSide` before, fixing the luma and patch pipeline will also make RSA verification succeed when the backend actually embedded a signature on that frame.

---

## 10. Checklist for the AI / Developer

- [ ] **Luma:** Convert canvas RGB → Y (BT.709 or BT.601) and use **only Y** for patches and right-side sums.
- [ ] **Canvas size:** Use `video.videoWidth` and `video.videoHeight` for the analysis canvas; crop to `(W - W%16)` and `(H - H%16)`.
- [ ] **Patch matrix:** 16×16 block means of Y, rounded with `(mean + 0.5) | 0`.
- [ ] **Right-end index:** `groups_per_column = H'/5`, `num_left_columns = ceil(256/groups_per_column)`, `right_end_index = patch_cols - num_left_columns`.
- [ ] **Right-side:** Row sums over columns `0..right_end_index-1`, factor 1.
- [ ] **Decode:** `repsUsed = min(7, floor(rightSide.length/9))`, 9 groups, mode per group, `digitStr` of 9 digits, `parseInt(digitStr, 10)` without stripping trailing zeros.
- [ ] **Validation:** Reject mode &gt; 9; if many rightSide values are outside 0–9 in the first 9*repsUsed positions, fix luma/crop/patch before changing decode logic.

---

## 11. References

- Backend patch matrix: `patch_frame` in `watermark_video/watermark_call_function.py`.
- Backend right-side and pattern: `watermark_y_patches_2`, `create_column_sums`, `return_pattern_user_id_reps` (in `watermark_video/watermark_call_function.py` and `watermark_video/utils.py`).
- Full verification spec: `docs/FRONTEND_WATERMARK_VERIFICATION_SPEC.md`.
- 9-digit decode summary: `docs/FRONTEND_USER_ID_DECODE_UPDATE.md`.
