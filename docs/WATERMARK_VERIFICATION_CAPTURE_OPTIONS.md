# Watermark verification: capture options (canvas vs WebCodecs)

This doc summarizes how we capture the video frame for verification and whether WebCodecs (or something else) would improve alignment with the backend.

## Current approach: canvas + RGB → Y

- We draw the playing video to an offscreen canvas at 1:1 (`video.videoWidth` × `video.videoHeight`), then `getImageData()` to get RGBA.
- We derive luma with **Y = f(R, G, B)** (BT.709 limited range) and run the rest of the pipeline on that Y.

**Why it can differ from the backend:** The backend uses the **raw Y (luma) plane** from the video codec (e.g. FFmpeg decode → Y channel). We never see that. We see **RGB** produced by the browser when it decodes the same video for display (YUV → RGB in the browser’s pipeline), then we compute **Y from that RGB**. So our Y is “Y derived from the display path,” not “codec Y.” Color space, gamma, and rounding in that chain can cause small (or occasional large) differences and explain values outside 0–9 in some positions.

## Option 1: WebCodecs `VideoFrame` from the video element

- `new VideoFrame(videoElement, { timestamp })` gives a frame from the current playback.
- **Format:** When created from an image source (video, canvas), the frame’s `format` is implementation-defined; in practice browsers typically expose **RGBA** (the rendered frame), not YUV (I420).
- So we **do not** get the codec’s Y plane from this. We’d still need to derive Y from RGB (e.g. via `copyTo` with `format: "RGBA"`) and would be in the same situation as canvas. No accuracy gain for backend alignment.

## Option 2: WebCodecs `VideoDecoder` (decode the file ourselves)

- We **decode the video file** (same URL as playback) with `VideoDecoder` and get `VideoFrame` objects.
- Decoded frames are often in a **YUV format (e.g. I420)**. We can then **read the Y plane** via `copyTo()` with the right layout (plane 0 = Y, stride = width, etc.) and feed that Y into the existing pipeline.
- That Y is the **same kind of data** the backend uses (decoded luma from the codec), so alignment is best possible on the frontend.
- **Cost:** We need to **demux** the container (e.g. MP4) to get `EncodedVideoChunk` inputs for `VideoDecoder`. That means a JS demuxer (e.g. mp4box.js, or similar) and wiring: fetch video → demux → decode key frames or frame 0 → read Y plane. We also decode the same stream twice (once in the `<video>` element for playback, once in our code for verification) unless we change to a custom playback pipeline.
- **Recommendation:** Best for **accuracy and backend alignment**. Implement when the product priority is “match backend exactly”; accept the extra dependency (demuxer) and double-decode or a more custom playback path.

## Option 3: Keep canvas, align formula and pipeline

- Keep the current canvas capture and **single** derivation path (e.g. BT.709 limited range).
- Ensure **all other steps** (crop, patch matrix, row sums, modulo, decode) match the backend exactly (as in the checklist).
- Any remaining mismatch is then **only** from the Y source (codec Y vs Y-from-RGB). Backend could optionally export a “reference rightSide for frame 0” for a test asset to validate the rest of the pipeline.

## Summary

| Approach                    | Y source              | Backend alignment      | Complexity        |
|----------------------------|------------------------|------------------------|-------------------|
| Canvas + RGB→Y (current)   | Y derived from RGB     | Good except Y source   | Low               |
| VideoFrame from &lt;video&gt; | Usually RGBA → same as canvas | No real gain           | Low               |
| VideoDecoder + demuxer     | Raw codec Y (e.g. I420)| Best                   | Medium (demuxer)  |

**Implementation (done):** The app now tries **WebCodecs first** for frame 0: `src/lib/webcodecs-capture.ts` fetches the video URL, demuxes with **web-demuxer** (WASM), decodes one frame with `VideoDecoder`, and extracts the I420/NV12 Y plane. The hook `useWatermarkVerification` calls `captureFrame0YFromUrl(videoUrl)` then `decodeNumericUserIdFromLuma` and `decodeAndVerifyFrameFromLuma`. If WebCodecs is unavailable or fails (CORS, unsupported codec, etc.), it **falls back to canvas**. The WASM file must be at **`public/wasm/web-demuxer.wasm`** (copy from `node_modules/web-demuxer/dist/wasm-files/web-demuxer-mini.wasm` or use the full wasm).
