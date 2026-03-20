# Third-Party Next.js App: Watermarked Video Playback and Verification — Implementation Guide

This document gives **exact implementation instructions** for third-party Next.js applications to play SAIVD watermarked videos and verify them using the same process: **frame 0 capture via WebCodecs + WebAssembly demuxer**, **decode numeric user ID**, **fetch RSA public key from SAIVD**, and **verify the watermark with the public key**. Follow each section in order.

---

## 1. SAIVD service and base URL

**SAIVD** is the service that stores creator public keys and serves QR code images. Your app does not host keys or generate QR codes; it only calls SAIVD’s public API.

- **Base URL:** `https://saivd.netlify.app`
- **Public key API:** `GET https://saivd.netlify.app/api/users/{numericUserId}/public-key`
- **QR code image (for overlay):** `https://saivd.netlify.app/profile/{numericUserId}/qr`
- **Creator profile page:** `https://saivd.netlify.app/profile/{numericUserId}`

Replace `{numericUserId}` with the 9-digit integer you decode from frame 0 of the watermarked video (e.g. `1`, `123456789`).

---

## 2. End-to-end playback flow (what to implement)

1. Your app has a **watermarked video URL** (from your own storage; you do not call SAIVD for playback URLs).
2. When the user opens the player for that video, **do not set `<video src>` yet**. Show a “Verifying…” state.
3. Run **frame 0 verification** (steps 3–7 below). All of this runs in the browser; no full-video download until after verification.
4. **If verification succeeds:** set `video.src = videoUrl`, allow play, and optionally show the QR overlay image from `https://saivd.netlify.app/profile/{numericUserId}/qr`.
5. **If verification fails:** do not set `video.src`; show an error (e.g. “Video could not be verified”) and do not allow play.

Verification steps in order:

- **Step 3:** Capture frame 0’s **Y (luma) plane** using WebCodecs + WASM demuxer (required).
- **Step 4:** Decode **numeric_user_id** from that Y plane (no key).
- **Step 5:** Fetch the **RSA public key** from SAIVD using that numeric user ID.
- **Step 6:** Import the key and **verify** frame 0’s watermark (message + signature) with the public key.
- **Step 7:** If step 6 returns success, treat the video as verified and allow playback.

---

## 3. Step 1 — Capture frame 0 luma (Y) with WebCodecs and WebAssembly

Frame 0 capture **must** use **WebCodecs** and a **WASM demuxer**. The encoder uses the raw Y plane from the codec; the only way to get the same Y in the browser is to decode the video with WebCodecs and read the Y plane from the decoded frame.

### 3.1 Prerequisites

- **npm package:** `web-demuxer` (e.g. version ^4.0.0). Install in your project.
- **WASM file:** The package includes a WebAssembly file. Copy it from the package into your app’s **public** static folder (e.g. `public/wasm/web-demuxer.wasm`). Use the **full** WASM build (often at `node_modules/web-demuxer/dist/wasm-files/web-demuxer.wasm` or similar). Do **not** use a “mini” build; the full build is required for demuxing and seeking to time 0.
- **WASM URL:** The demuxer must load the WASM by URL. Use an **absolute URL**, e.g. `window.location.origin + "/wasm/web-demuxer.wasm"`. If the library runs inside a Web Worker, relative paths can fail.
- **Content-Type:** Serve the WASM file with `Content-Type: application/wasm` (or `application/octet-stream`). You can check with `fetch(wasmUrl, { method: "HEAD" })` and inspect the response headers.

### 3.2 Check WebCodecs support

Before running capture, check that the following exist in the global scope:

- `typeof VideoDecoder !== "undefined"`
- `typeof EncodedVideoChunk !== "undefined"`
- `typeof VideoFrame !== "undefined"`

If any are missing, do not proceed with WebCodecs capture; treat verification as unsupported or show an error.

### 3.3 Range fetch

Watermarked videos are typically **faststart** MP4 (metadata at the start). Fetch only the beginning of the file.

- **Range sizes to try, in order:** `8 * 1024 * 1024` (8 MB), then `16 * 1024 * 1024` (16 MB) if the first fails.
- For each size `byteCount`, request:  
  `fetch(videoUrl, { mode: "cors", headers: { Range: "bytes=0-" + (byteCount - 1) } })`.
- If the response is not `ok`, try the next size (or fail).
- Read the body: `await response.arrayBuffer()`. You may get `206 Partial Content` or `200 OK`; both are acceptable as long as you have bytes.
- Build a `File` for the demuxer: `new File([buffer], "video.mp4", { type: "video/mp4" })`.

### 3.4 Demux and get decoder config

- Dynamically import: `const { WebDemuxer } = await import("web-demuxer");`
- Create demuxer with the **absolute** WASM URL: `const demuxer = new WebDemuxer({ wasmFilePath: wasmAbsoluteUrl });`
- Load the file: `await demuxer.load(file);`
- Get video decoder config: `const config = await demuxer.getDecoderConfig("video");`  
  If `config` is null or undefined, demux failed or there is no video track; try the next range size or fail.
- **Seek to time 0:** `const chunk = await demuxer.seek("video", 0);`  
  This returns an `EncodedVideoChunk` (or the library’s equivalent) for the first frame. If this is null, the range may be too small; try the next range size.
- When you are done with the demuxer (whether or not decode succeeds), call `demuxer.destroy()`.

### 3.5 Decode one frame with VideoDecoder

- Create a `VideoDecoder` with two callbacks:
  - **output:** receives a `VideoFrame`. On first call, resolve your Promise with this frame. If you receive more frames, call `frame.close()` on them (you only need frame 0).
  - **error:** receives an Error; reject your Promise with it.
- Call `decoder.configure(config)` with the config from step 3.4.
- Call `decoder.decode(chunk)`.
- Call `decoder.flush()` and wait for it. Your `output` callback will be invoked with one `VideoFrame` (frame 0). If `flush()` resolves without any `output` call, resolve your Promise with null.
- Implementation pattern:

```ts
function decodeOneFrame(
  config: VideoDecoderConfig,
  chunk: EncodedVideoChunk
): Promise<VideoFrame | null> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        if (!resolved) {
          resolved = true;
          resolve(frame);
        } else {
          frame.close();
        }
      },
      error: (e: Error) => {
        if (!resolved) {
          resolved = true;
          reject(e);
        }
      },
    });
    decoder.configure(config);
    decoder.decode(chunk);
    decoder.flush().then(
      () => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      },
      (e) => {
        if (!resolved) {
          resolved = true;
          reject(e);
        }
      }
    );
  });
}
```

### 3.6 Extract Y plane from the VideoFrame

- Read dimensions: `const width = frame.codedWidth;` and `const height = frame.codedHeight;`. If either is ≤ 0, return null.
- Check format: `frame.format` must be `"I420"` or `"NV12"`. If not, return null.
- Allocate buffer: `const buffer = new Uint8Array(frame.allocationSize());`
- Copy frame data: `const layout = await frame.copyTo(buffer);`
- The `layout` may be an array of plane descriptors or an object with a `layout` property that is an array. Each descriptor has `offset` (byte offset into `buffer`) and `stride` (bytes per row). **Plane 0 is the Y (luma) plane.**
- Resolve layout:  
  `const planes = Array.isArray(layout) ? layout : (layout as { layout?: { offset: number; stride: number }[] })?.layout;`  
  `const yOffset = planes?.[0]?.offset ?? 0;`  
  `const yStride = planes?.[0]?.stride ?? width;`
- Allocate Y plane: `const yPlane = new Uint8Array(width * height);`
- Copy Y into it:
  - If `yStride === width`:  
    `yPlane.set(buffer.subarray(yOffset, yOffset + width * height));`
  - Else, row by row:  
    `for (let row = 0; row < height; row++) { yPlane.set(buffer.subarray(yOffset + row * yStride, yOffset + row * yStride + width), row * width); }`
- Call `frame.close()`.
- **Crop to multiple of 16:**  
  `const cropW = width - (width % 16);`  
  `const cropH = height - (height % 16);`  
  If `cropW <= 0` or `cropH <= 0`, return null.  
  Allocate `croppedLuma` of length `cropW * cropH`. For each `y` in `0..cropH-1` and `x` in `0..cropW-1`:  
  `croppedLuma[y * cropW + x] = yPlane[y * width + x];`
- Return `{ yPlane: croppedLuma, width: cropW, height: cropH }`.

### 3.7 End-to-end capture function

- Check WebCodecs support (step 3.2). If missing, return null.
- Optionally `HEAD` the WASM URL to verify it is served.
- Loop over range sizes `[8*1024*1024, 16*1024*1024]`:
  - Fetch range (step 3.3) → build `File`.
  - Create demuxer, `load(file)`, `getDecoderConfig("video")`, `seek("video", 0)` (step 3.4). If any returns null, try next range.
  - `decodeOneFrame(config, chunk)` (step 3.5). If null, try next range.
  - Extract Y plane and crop to multiple of 16 (step 3.6). If null, try next range.
  - Call `demuxer.destroy()`.
  - Return `{ yPlane, width, height }` (cropped).
- If all range sizes fail, return null.

---

## 4. Step 2 — Decode numeric user ID from frame 0 (no key)

Use the **cropped** luma from step 3 (`yPlane`, `width`, `height`). All constants must match the encoder.

### 4.1 Constants

- `PATCH_SIZE = 16`
- `SIGNATURE_LENGTH = 256`
- `USER_ID_DIGITS = 9`
- `REPS = 7`

### 4.2 Build patch matrix

- `patchRows = Math.floor(height / 16)`
- `patchCols = Math.floor(width / 16)`
- Build a 2D array `givenFrame[py][px]` for `py` in `0..patchRows-1`, `px` in `0..patchCols-1`. For each block, sum the 256 luma values in the 16×16 block at `(py*16 .. py*16+15, px*16 .. px*16+15)` and set:  
  `givenFrame[py][px] = (sum + 128) >> 8`  
  (integer rounding; equivalent to `Math.round(sum/256)`).

Exact indexing for the sum:  
`sum += yPlane[(py * 16 + dy) * width + (px * 16 + dx)]` for `dy, dx` in `0..15`.

### 4.3 Right-end index

- `groupsPerColumn = Math.floor(height / 5)`
- If `groupsPerColumn <= 0`, return null.
- `numLeftColumns = Math.ceil(256 / groupsPerColumn)`
- `rightEndIndex = Math.max(0, patchCols - numLeftColumns)`  
  If `rightEndIndex <= 0`, return null.

### 4.4 Right-side row sums

- For each row `r` in `0..patchRows-1`:  
  `rawSum = sum of givenFrame[r][c] for c in 0..rightEndIndex-1`  
  `rightSide[r] = rawSum % rightEndIndex`
- So each value is in `[0, rightEndIndex-1]`. Length of `rightSide` = `patchRows`.

### 4.5 Decode 9-digit user ID from rightSide

- `repsUsed = Math.min(7, Math.floor(rightSide.length / 9))`. If `repsUsed < 1`, return null.
- `nVals = 9 * repsUsed`
- Take the first `nVals` values: `prefix = rightSide.slice(0, nVals)`.
- Split into 9 groups of `repsUsed` values. For each group, compute the **mode** (most frequent value). On a tie, use the **smallest** value (so that e.g. `000000001` decodes to 1).
- Mode implementation: build a map of value → count; then choose the value with largest count, and on tie choose the smaller value.
- Each mode must be in `0..9`. If any group has no valid mode or mode not in 0–9, return null.
- Concatenate the 9 digits into a string (e.g. `"000000001"`). Do **not** strip trailing zeros.
- `numeric_user_id = parseInt(digitStr, 10)`. If NaN or ≤ 0, return null.
- Return `numeric_user_id`.

---

## 5. Step 3 — Fetch RSA public key from SAIVD

- **URL:** `GET https://saivd.netlify.app/api/users/{numericUserId}/public-key`  
  Use the integer from step 4 (e.g. `12345`).
- **Request:** `fetch(url, { method: "GET", credentials: "omit" })`.
- **Success (200):** Response body is JSON:  
  `{ "success": true, "data": { "public_key_pem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n" } }`  
  Extract `data.public_key_pem` (the PEM string).
- **Errors:** 400 (invalid numeric user ID), 404 (user not found or no public key), 500 (server error). Body shape: `{ "success": false, "error": { "code": "...", "message": "..." } }`. Throw or return an error so the caller can treat verification as failed.

Example:

```ts
const SAVD_BASE_URL = "https://saivd.netlify.app";

async function fetchPublicKeyPem(numericUserId: number): Promise<string> {
  const res = await fetch(
    `${SAVD_BASE_URL}/api/users/${numericUserId}/public-key`,
    { method: "GET", credentials: "omit" }
  );
  const data = await res.json();
  if (!res.ok || !data.success || !data.data?.public_key_pem) {
    throw new Error(data?.error?.message ?? `Failed to fetch public key: ${res.status}`);
  }
  return data.data.public_key_pem;
}
```

---

## 6. Step 4 — Import public key and verify frame 0 with RSA

### 6.1 Import PEM to CryptoKey

- Take the PEM string from step 5.
- Strip headers and whitespace: remove all `-----BEGIN PUBLIC KEY-----`, `-----END PUBLIC KEY-----`, and any `\n`/spaces.
- Base64-decode: `const binary = atob(trimmed);`
- Copy into a `Uint8Array`: `buffer[i] = binary.charCodeAt(i)` for each index.
- Import key:  
  `crypto.subtle.importKey("spki", buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])`  
  This returns a `Promise<CryptoKey>`.

### 6.2 Compute right-side row sums and left-side signature from cropped luma

Use the **same** cropped luma from step 3 (`yPlane`, `width`, `height` — these are the cropped dimensions). Reuse the same constants and formulas as in step 4.

- Build the **patch matrix** (same as step 4.2) from the cropped luma. Use the same `rightEndIndex` formula (step 4.3).
- **Right-side row sums:** Same as step 4.4. Call this array `rightSide`.
- **Left-side signature (256 bytes):**
  - `leftStartCol = rightEndIndex * 16`
  - If `leftStartCol >= width`, the left region is empty; fill 256 bytes with 0 or fail.
  - Iterate in **column-major** order: for each column `col` in `0..(leftWidth-1)` (where `leftWidth = width - leftStartCol`), and for each group of 5 consecutive rows in that column, compute the **sum of the 5 luma values** (no division). Each sum is one signature byte (clamp to 0–255). Collect exactly 256 such values.  
  - Pixel column index: `pixelCol = leftStartCol + col`. For `groupStart = 0, 5, 10, ...` while `groupStart + 5 <= height` and you have fewer than 256 values:  
    `sum = luma[(groupStart+0)*width+pixelCol] + luma[(groupStart+1)*width+pixelCol] + ... + luma[(groupStart+4)*width+pixelCol]`  
    Push `Math.max(0, Math.min(255, sum))`.  
  - Build a 256-byte `Uint8Array` with these values (if you have fewer than 256, pad with 0; if more, take the first 256).

### 6.3 Build message bytes and verify

- **Message:** First 100 values of `rightSide`. Build the string:  
  `messageString = rightSide.slice(0, 100).map(v => String.fromCharCode(v)).join("")`  
  Encode to bytes: `messageBytes = new TextEncoder().encode(messageString)`. If `messageBytes.length === 0`, verification fails.
- **Verify:**  
  `crypto.subtle.verify(  
    { name: "RSASSA-PKCS1-v1_5" },  
    publicKey,  
    signatureBytes,   // the 256-byte Uint8Array from step 6.2  
    messageBytes  
  )`  
  This returns a `Promise<boolean>`. If `true`, frame 0’s watermark is valid for that creator.

### 6.4 Full frame 0 verify (from cropped luma)

Given `(yPlane, width, height)` from step 3 and `publicKey` from step 6.1:

1. Build patch matrix (step 4.2), compute `rightEndIndex` (step 4.3), compute `rightSide` (step 4.4).
2. Decode `numeric_user_id` from `rightSide` (step 4.5) — you already did this earlier; you need `rightSide` again for the message.
3. Extract left-side signature (step 6.2).
4. Build `messageBytes` from first 100 elements of `rightSide` (step 6.3).
5. Call `crypto.subtle.verify(...)`. If it returns `true`, verification succeeded; allow playback and use `numeric_user_id` for the QR URL.

---

## 7. Playback UI behavior

- **Before verification:** Do not set `video.src` (or set it to empty/placeholder). Show a “Verifying video…” (or spinner) overlay. Optionally run verification as soon as you have the video URL (using Range requests and WebCodecs; the full file is not loaded).
- **After verification success:** Set `video.src = videoUrl`, allow the user to press play. Optionally display the QR image:  
  `<img src={"https://saivd.netlify.app/profile/" + numericUserId + "/qr"} alt="Creator QR" />`
- **After verification failure:** Do not set `video.src`. Show an error message (e.g. “This video could not be verified” or “Viewing not allowed”) and do not allow play.

---

## 8. Constants reference

| Name | Value | Use |
|------|--------|-----|
| `PATCH_SIZE` | 16 | Patch matrix block size; crop dimensions to multiple of 16 |
| `SIGNATURE_LENGTH` | 256 | Signature bytes; left region has 256 slot sums (5 pixels each) |
| `MAX_MESSAGE_LENGTH` | 100 | Message = first 100 values of rightSide (as string, then UTF-8) |
| `USER_ID_DIGITS` | 9 | Numeric user ID is 9 decimal digits, zero-padded |
| `REPS` | 7 | repsUsed = min(7, floor(rightSide.length/9)) |
| RSA algorithm | RSASSA-PKCS1-v1_5, SHA-256 | Web Crypto importKey and verify |
| Range sizes | 8 MB, 16 MB | Try in order for frame 0 fetch |
| SAIVD base URL | https://saivd.netlify.app | Public key and QR endpoints |

---

## 9. Summary checklist

- [ ] Install `web-demuxer` and serve its **full** WASM file at a public absolute URL (e.g. `origin + "/wasm/web-demuxer.wasm"`).
- [ ] Check for `VideoDecoder`, `EncodedVideoChunk`, `VideoFrame` before capture.
- [ ] Fetch video start with Range (8 MB, then 16 MB if needed); build `File`; load with WebDemuxer; get config and `seek("video", 0)`; decode one frame with `VideoDecoder`; extract Y plane from `VideoFrame` (I420/NV12, plane 0); crop to multiple of 16.
- [ ] Build patch matrix with `(sum + 128) >> 8`; compute `rightEndIndex` and `rightSide`; decode numeric user ID (9 groups, mode per group, tie-break smallest).
- [ ] Fetch `GET https://saivd.netlify.app/api/users/{numericUserId}/public-key`; parse `public_key_pem`.
- [ ] Import key: strip PEM, atob, `crypto.subtle.importKey("spki", ..., RSASSA-PKCS1-v1_5, SHA-256, ["verify"])`.
- [ ] Extract left-side 256 signature bytes (column-major, 5-pixel groups); build message from first 100 rightSide values (UTF-8); `crypto.subtle.verify(..., publicKey, signatureBytes, messageBytes)`.
- [ ] If verify returns true: set `video.src`, allow play, optionally show QR from `https://saivd.netlify.app/profile/{numericUserId}/qr`. If verify fails or any step fails: do not set `video.src`; show error and block play.

This guide is self-contained and does not reference other repositories or internal paths. The only external dependency is the SAIVD API at `https://saivd.netlify.app`.
