# Frontend Watermark Verification – Implementation Guide (Next.js Apps)

This document describes the **end‑to‑end implementation strategy** for:

- Decoding the embedded `numeric_user_id` from a watermarked video frame in the browser.
- Fetching the creator’s **public RSA key** from this SAVD app.
- Verifying the watermark using the public RSA key (optional but recommended).

It is intended as **context for coding AIs** and developers working on:

- This SAVD Next.js application.
- **Third‑party Next.js applications** that need to verify the same watermarked videos.

> **Key point for third‑party apps:**  
> Third‑party apps **do not** need their own key store. They should:
> 1. Decode `numeric_user_id` from the video locally.
> 2. Call this app’s **public, unauthenticated** endpoint  
>    `GET /api/users/{numericUserId}/public-key`  
>    to obtain the RSA public key (PEM) for that creator.
> 3. Use that key to verify the watermark in the browser.

---

## 1. System Roles and Data Flow

### 1.1 Components

- **Watermarking service (Python, encoder)**  
  - Takes original video + `numeric_user_id` + RSA private key.  
  - Writes a watermark into the **Y (luma) channel** of frames `0, 10, 20, …`.  
  - Right side: embeds a repeated digit pattern encoding `numeric_user_id`.  
  - Left side: embeds a **256‑byte RSA signature** over the first 100 right‑side values.

- **SAVD Next.js app (this repo)**  
  - Stores user profiles and **RSA public keys** in the `profiles` table.
  - Exposes a **public endpoint**:
    - `GET /api/users/{numericUserId}/public-key`
  - Serves watermarked videos from Wasabi/S3 (with proper CORS).

- **Third‑party Next.js apps**  
  - Receive or load the same watermarked video URLs.
  - Implement the **same decode + verify algorithm** in their frontend.
  - Call this SAVD app’s public key endpoint to obtain the RSA public key.

### 1.2 High‑Level Flow

For any Next.js app (this one or a third‑party) verifying a watermarked video:

1. Load the watermarked video in a `<video>` element (`crossOrigin="anonymous"`).
2. Capture **frame 0** to a `Canvas` and obtain `ImageData`.
3. From that `ImageData`:
   - Reconstruct limited‑range BT.709 luma (Y) values.
   - Crop to multiples of 16.
   - Build a 16×16 **patch matrix**.
   - Compute the **right side row sums** and decode `numeric_user_id`.
4. Call this SAVD app: `GET /api/users/{numericUserId}/public-key`.
5. Import the returned PEM into a `CryptoKey` via Web Crypto.
6. For frame 0 (and optionally frames 10, 20, …):
   - Recompute **right_side** and **left_side** (256‑byte signature).
   - Build the message from the first 100 right_side values.
   - Run `crypto.subtle.verify` with the public key.
7. Treat “user ID decoded + (optionally) RSA verified” as **video authenticity**.

---

## 2. Public RSA Key API (SAVD App)

### 2.1 Endpoint

- **Route (Next.js App Router)**  
  - File: `src/app/api/users/[numericUserId]/public-key/route.ts`
  - Method: `GET`
  - Path (relative to SAVD app origin):  
    - `/api/users/{numericUserId}/public-key`

### 2.2 Authentication and Access

- **No authentication required.**  
  - This endpoint is intentionally **public**, because third‑party applications must be able to request the RSA public key by `numeric_user_id`.
  - Only the **public** key is exposed; private keys never leave secure storage on the backend.

- The SAVD app should be configured with appropriate **CORS** so that:
  - Third‑party browser clients can call this endpoint via `fetch` from another origin.
  - Example: Allow `GET` from trusted origins and expose standard JSON headers.

### 2.3 Request

- **Method:** `GET`
- **URL:**  
  `https://<savd-origin>/api/users/{numericUserId}/public-key`

- **Path parameter:**
  - `numericUserId` – positive integer; decoded from the watermark.

### 2.4 Response Format

All responses follow the SAVD API envelope:

- **Success:**

```json
{
  "success": true,
  "data": {
    "public_key_pem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkq...\n-----END PUBLIC KEY-----\n"
  }
}
```

- **Error:**

```json
{
  "success": false,
  "error": {
    "code": "validation_error | not_found | server_error",
    "message": "Human readable description"
  }
}
```

### 2.5 Example Usage (Third‑Party Next.js App)

```ts
async function fetchPublicKeyPemFromSavd(
  savdBaseUrl: string,
  numericUserId: number
): Promise<string> {
  const res = await fetch(
    `${savdBaseUrl}/api/users/${numericUserId}/public-key`,
    {
      method: "GET",
      // Typically include credentials: "omit" for pure public usage
      credentials: "omit"
    }
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success || !body.data?.public_key_pem) {
    throw new Error(
      body?.error?.message ??
        `Failed to fetch public key (status ${res.status})`
    );
  }
  return body.data.public_key_pem as string;
}
```

---

## 3. Frame Capture and Luma Reconstruction

### 3.1 Capturing a Frame

1. Render the video in a `<video>` element:

```tsx
<video
  ref={videoRef}
  src={videoUrl}
  crossOrigin="anonymous" // Required so canvas is not tainted
/>
```

2. When ready (e.g. `loadeddata` + `seeked` to `currentTime = 0`):

```ts
function captureFrameToImageData(video: HTMLVideoElement): ImageData | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
```

### 3.2 Luma (Y) – Limited‑Range BT.709

The backend watermarking service operates on the **raw Y plane** in **limited‑range BT.709**:

- Y range is approximately **16–235** (not 0–255).
- Browser decoders convert limited‑range YUV → **full‑range RGB** for display.
- To recover the original Y values closely enough for decoding, use:

```ts
function imageDataToLumaLimitedBt709(data: ImageData): Uint8Array {
  const { width, height, data: rgba } = data;
  const luma = new Uint8Array(width * height);
  const scale = 219 / 255; // ≈ 0.8588

  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];

    // BT.709 full‑range coefficients
    const yFull = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Convert back to limited‑range Y (16–235)
    const yLimited = 16 + scale * yFull;
    luma[i] = Math.max(0, Math.min(255, Math.round(yLimited)));
  }

  return luma;
}
```

### 3.3 Cropping to Multiples of 16

The encoder works on frames whose width and height are multiples of **16**.

```ts
const PATCH_SIZE = 16;

function cropToMultipleOf16(
  imageData: ImageData
): { luma: Uint8Array; width: number; height: number } {
  const croppedWidth = imageData.width - (imageData.width % PATCH_SIZE);
  const croppedHeight = imageData.height - (imageData.height % PATCH_SIZE);

  const fullLuma = imageDataToLumaLimitedBt709(imageData);
  const croppedLuma = new Uint8Array(croppedWidth * croppedHeight);

  for (let y = 0; y < croppedHeight; y++) {
    for (let x = 0; x < croppedWidth; x++) {
      croppedLuma[y * croppedWidth + x] =
        fullLuma[y * imageData.width + x];
    }
  }

  return { luma: croppedLuma, width: croppedWidth, height: croppedHeight };
}
```

---

## 4. Patch Matrix and Right Side Row Sums

### 4.1 Patch Matrix (16×16)

Given cropped luma values:

```ts
function buildPatchMatrix(
  luma: Uint8Array,
  width: number,
  height: number
): number[][] {
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
      row.push((mean + 0.5) | 0); // integer rounding
    }
    matrix.push(row);
  }

  return matrix;
}
```

### 4.2 `right_end_index` (Right/Left Split)

Definitions:

- `H` – full frame height in **pixels** (after cropping).
- `patchCols` – number of patch columns (`givenFrame[0].length`).
- `groups_per_column = floor(H / 5)` – vertical 5‑pixel groups in the **left** region.
- `num_left_columns = ceil(256 / groups_per_column)` – columns needed to hold 256 groups.
- `right_end_index = patchCols - num_left_columns` – number of patch columns in the **right** region.

```ts
const SIGNATURE_LENGTH = 256;

function getRightEndIndex(pixelHeight: number, patchCols: number): number {
  const groupsPerColumn = Math.floor(pixelHeight / 5);
  if (groupsPerColumn <= 0) return 0;
  const numLeftColumns = Math.ceil(SIGNATURE_LENGTH / groupsPerColumn);
  return Math.max(0, patchCols - numLeftColumns);
}
```

### 4.3 Right Side Row Sums

The backend’s `create_column_sums` on the **right** region:

- Sums **across columns** for each row (`axis=1`).
- Uses `factor = 1` (no division).
- Applies modulo `MAX_VAL = right_end_index`.

Result:

- Length = patch row count.
- Each value in `[0, right_end_index)`.

```ts
function getRightSideRowSums(
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
    const value = sum % rightEndIndex; // factor = 1
    rightSide.push(value);
  }

  return rightSide;
}
```

---

## 5. Decoding `numeric_user_id` from Right Side

### 5.1 Pattern Encoding

- The backend encodes the user ID as **repeated digits**:
  - `USER_ID_DIGITS = 9`
  - `REPS = 7`
  - The ideal pattern length is `9 * 7 = 63` values, but on lower‑height videos fewer rows are available.
- Each group of 7 values corresponds to one digit in `0..9`:
  - The **mode** (most frequent value) in the group is the digit.

For some resolutions (e.g. 1280×704), you may only get enough data for 6 effective digits, and the encoder uses **right‑padded zeros**. The backend logic effectively:

- Decodes as many digits as possible (up to 9).
- Builds a digit string.
- Applies `rstrip('0')` on the string.

### 5.2 Decode Algorithm

```ts
const USER_ID_DIGITS = 9;
const REPS = 7;

function mode(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let maxCount = 0;
  for (const [v, c] of counts) {
    if (c > maxCount) {
      maxCount = c;
      best = v;
    }
  }
  return best;
}

function decodeNumericUserIdFromRightSide(rightSide: number[]): number | null {
  const usable = rightSide.length - (rightSide.length % REPS);
  const numGroups = Math.floor(usable / REPS);
  if (numGroups === 0) return null;

  const maxDigits = Math.min(numGroups, USER_ID_DIGITS);
  const digits: number[] = [];

  for (let d = 0; d < maxDigits; d++) {
    const group = rightSide.slice(d * REPS, (d + 1) * REPS);
    const m = mode(group);
    if (m === null || m < 0 || m > 9) {
      return null;
    }
    digits.push(m);
  }

  // Backend behavior: ''.join(str(d) for d in digits[:9]).rstrip('0')
  let str = digits.join("");
  str = str.replace(/0+$/, "");
  if (!str) return null;

  const parsed = parseInt(str, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
```

### 5.3 Putting It Together for Frame 0

```ts
function decodeNumericUserIdFromFrame0(imageData: ImageData): number | null {
  const { luma, width, height } = cropToMultipleOf16(imageData);
  if (width === 0 || height === 0) return null;

  const givenFrame = buildPatchMatrix(luma, width, height);
  const patchCols = givenFrame[0]?.length ?? 0;
  const rightEndIndex = getRightEndIndex(height, patchCols);
  if (rightEndIndex <= 0) return null;

  const rightSide = getRightSideRowSums(givenFrame, rightEndIndex);
  return decodeNumericUserIdFromRightSide(rightSide);
}
```

---

## 6. Left Side Signature Extraction (256 Bytes)

### 6.1 Left Region

- `left_start_col_pixels = right_end_index * 16`
- `left_frame` is the pixel region from `left_start_col_pixels` to the end of the frame.

### 6.2 5‑Pixel Groups and Signature Bytes

- For each column in `left_frame`:
  - Walk downwards in steps of 5 rows: `[0..4], [5..9], ...`.
  - For each group of 5 pixels, sum the luma values.
  - Collect sums in **column‑major** order.
- Take the **first 256 sums**, clamp each to byte range `0..255`.

```ts
function getLeftSideSignature(
  luma: Uint8Array,
  width: number,
  height: number,
  rightEndIndex: number
): Uint8Array {
  const leftStartCol = rightEndIndex * PATCH_SIZE;
  if (leftStartCol >= width) return new Uint8Array(256);

  const leftWidth = width - leftStartCol;
  const out: number[] = [];

  for (let col = 0; col < leftWidth && out.length < 256; col++) {
    const pixelCol = leftStartCol + col;
    for (
      let groupStart = 0;
      groupStart + 5 <= height && out.length < 256;
      groupStart += 5
    ) {
      let sum = 0;
      for (let r = 0; r < 5; r++) {
        sum += luma[(groupStart + r) * width + pixelCol];
      }
      out.push(Math.max(0, Math.min(255, sum)));
    }
  }

  const sig = new Uint8Array(256);
  for (let i = 0; i < 256 && i < out.length; i++) {
    sig[i] = out[i];
  }
  return sig;
}
```

---

## 7. RSA Verification with Web Crypto

### 7.1 Import Public Key from PEM

```ts
async function importPublicKeyFromPem(pem: string): Promise<CryptoKey> {
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
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}
```

### 7.2 Build Message Bytes

The backend signs the first **100** right_side values as a string:

- `message = right_side.slice(0, 100).map(v => String.fromCharCode(v)).join("")`
- Then encoded to bytes (`UTF‑8`).

```ts
const MAX_MESSAGE_LENGTH = 100;

function buildMessageBytes(rightSide: number[]): Uint8Array {
  const len = Math.min(MAX_MESSAGE_LENGTH, rightSide.length);
  const chars: string[] = [];
  for (let i = 0; i < len; i++) {
    chars.push(String.fromCodePoint(rightSide[i]));
  }
  const str = chars.join("");
  return new TextEncoder().encode(str);
}
```

### 7.3 Verify One Frame

```ts
async function verifyFrame(
  publicKey: CryptoKey,
  rightSide: number[],
  signatureBytes: Uint8Array
): Promise<boolean> {
  const messageBytes = buildMessageBytes(rightSide);
  if (messageBytes.length === 0) return false;

  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    signatureBytes,
    messageBytes
  );
}
```

### 7.4 Full Decode + Verify for a Frame

```ts
async function decodeAndVerifyFrame(
  publicKey: CryptoKey,
  imageData: ImageData
): Promise<{ verified: boolean; numericUserId: number | null }> {
  const { luma, width, height } = cropToMultipleOf16(imageData);
  if (width === 0 || height === 0) {
    return { verified: false, numericUserId: null };
  }

  const givenFrame = buildPatchMatrix(luma, width, height);
  const patchCols = givenFrame[0].length;
  const rightEndIndex = getRightEndIndex(height, patchCols);
  if (rightEndIndex <= 0) {
    return { verified: false, numericUserId: null };
  }

  const rightSide = getRightSideRowSums(givenFrame, rightEndIndex);
  const numericUserId = decodeNumericUserIdFromRightSide(rightSide);
  const signatureBytes = getLeftSideSignature(
    luma,
    width,
    height,
    rightEndIndex
  );

  const verified = await verifyFrame(publicKey, rightSide, signatureBytes);
  return { verified, numericUserId };
}
```

> **Note:** In the SAVD app, RSA verification is treated as **secondary**:
> - `numeric_user_id` decode is the primary check.
> - RSA verification may fail for some legacy/edge encodings; in that case, the app can still treat the video as authenticated if the user ID decode is correct and consistent across frames.  
> Third‑party apps can choose to be stricter (require RSA pass) or more lenient, depending on UX and security requirements.

---

## 8. End‑to‑End Flow for Third‑Party Next.js Apps

This is a reference algorithm for a third‑party Next.js app or coding AI:

1. **Load the video** into a `<video>` element with `crossOrigin="anonymous"`.
2. Wait for `loadeddata` (and optionally `seeked` to `currentTime = 0`).
3. **Capture frame 0** to `ImageData` via a hidden `<canvas>`.
4. Run `decodeNumericUserIdFromFrame0(imageData)`:
   - If it returns `null` or `<= 0`, treat the video as **not authentic**.
5. Call the SAVD app’s **public endpoint**:
   - `GET https://<savd-origin>/api/users/{numericUserId}/public-key`
   - No authentication required.
   - Parse `public_key_pem` from the JSON response.
6. Import the public key with `importPublicKeyFromPem(public_key_pem)`.
7. Optionally, for additional security:
   - Use `decodeAndVerifyFrame(publicKey, imageData)` on:
     - Frame 0.
     - Frames 10, 20, 30, … captured during playback.
8. Decide UX behavior:
   - If user ID decode succeeds but RSA fails, you may:
     - Block playback and label video as “not authentic”, **or**
     - Allow playback but show a “verification incomplete” warning.
   - If both user ID decode and RSA verification succeed, show “Verified” state.

---

## 9. Constants Summary

| Constant             | Value               |
|----------------------|--------------------|
| Patch size           | 16                 |
| Factor (row sums)    | 1                  |
| `MAX_MESSAGE_LENGTH` | 100                |
| Signature length     | 256 bytes          |
| User ID digits       | up to 9            |
| Repetitions per digit| 7                  |
| RSA padding          | PKCS1v15           |
| Hash                 | SHA‑256            |
| Luma range           | BT.709 limited (16–235) |

These definitions, combined with the API contract in §2, are sufficient for another Next.js application (and its coding AI assistants) to implement **fully compatible watermark decoding and verification** against videos produced by the SAVD watermarking pipeline.

