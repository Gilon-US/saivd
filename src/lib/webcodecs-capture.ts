/**
 * Capture frame 0 from a video URL using WebCodecs (fetch → demux → decode) and return the
 * raw Y (luma) plane. This matches the backend's Y source (codec output) for accurate
 * user ID extraction and RSA verification. Falls back to null if WebCodecs or demux fails.
 *
 * WASM: public/wasm/web-demuxer.wasm must be served (copied from web-demuxer package).
 * We must use an absolute URL: web-demuxer may load WASM from a worker, where relative
 * paths fail (WorkerGlobalScope has no base URL → "Failed to parse URL from /wasm/...").
 */

export type WebCodecsFrame0Result = {
  yPlane: Uint8Array;
  width: number;
  height: number;
};

/** Relative path for WASM; use getWasmAbsoluteUrl() when passing to WebDemuxer. */
const WASM_RELATIVE_PATH = "/wasm/web-demuxer.wasm";

function getWasmAbsoluteUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const base = window.location.origin.replace(/\/$/, "");
    return `${base}${WASM_RELATIVE_PATH}`;
  }
  return WASM_RELATIVE_PATH;
}

/** Verify WASM URL is reachable and returns application/wasm. Helps diagnose worker load failures. */
async function checkWasmUrl(): Promise<{ ok: boolean; status?: number; contentType?: string; error?: string }> {
  const url = getWasmAbsoluteUrl();
  try {
    const res = await fetch(url, { method: "HEAD" });
    const contentType = res.headers.get("content-type") ?? "";
    const ok = res.ok && (contentType.includes("application/wasm") || contentType.includes("application/octet-stream"));
    return { ok: res.ok, status: res.status, contentType, error: ok ? undefined : `Expected application/wasm, got ${contentType}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function isWebCodecsSupported(): boolean {
  return (
    typeof VideoDecoder !== "undefined" &&
    typeof EncodedVideoChunk !== "undefined" &&
    typeof VideoFrame !== "undefined"
  );
}

/**
 * Decode frame 0 from the video URL via WebCodecs and return the I420 Y plane.
 * Returns null if unsupported, fetch fails, demux fails, or decode fails.
 */
export async function captureFrame0YFromUrl(
  videoUrl: string
): Promise<WebCodecsFrame0Result | null> {
  if (!isWebCodecsSupported()) {
    console.warn("[WebCodecs] VideoDecoder/EncodedVideoChunk/VideoFrame not available");
    return null;
  }

  let demuxer: import("web-demuxer").WebDemuxer | null = null;

  try {
    const wasmCheck = await checkWasmUrl();
    if (!wasmCheck.ok) {
      console.warn("[WebCodecs] WASM URL check failed:", wasmCheck.status ?? wasmCheck.error, wasmCheck.contentType ?? "", wasmCheck.error ?? "");
    }

    // Fetch the video bytes in the main thread and pass a File to the demuxer. Passing a blob
    // URL causes the worker's WASM (Emscripten XHR) to fail: "GET is the only method allowed for blob: URLs".
    const response = await fetch(videoUrl, { mode: "cors" });
    if (!response.ok) {
      console.warn("[WebCodecs] fetch failed:", response.status, response.statusText);
      return null;
    }
    const buffer = await response.arrayBuffer();
    const file = new File([buffer], "video.mp4", { type: "video/mp4" });

    const { WebDemuxer } = await import("web-demuxer");
    demuxer = new WebDemuxer({ wasmFilePath: getWasmAbsoluteUrl() });
    await demuxer.load(file);

    const config = await demuxer.getDecoderConfig("video");
    if (!config) return null;

    const chunk = await demuxer.seek("video", 0);
    if (!chunk) return null;

    const frame = await decodeOneFrame(config, chunk);
    demuxer.destroy();
    demuxer = null;

    if (!frame) return null;
    try {
      const y = await extractYPlaneFromVideoFrame(frame);
      return y;
    } finally {
      frame.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.warn("[WebCodecs] captureFrame0YFromUrl failed:", msg);
    if (stack) console.warn("[WebCodecs] stack:", stack);
    return null;
  } finally {
    if (demuxer) demuxer.destroy();
  }
}

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

/**
 * Extract the Y (luma) plane from a VideoFrame. Supports I420 and NV12.
 */
async function extractYPlaneFromVideoFrame(
  frame: VideoFrame
): Promise<WebCodecsFrame0Result | null> {
  const width = frame.codedWidth;
  const height = frame.codedHeight;
  if (width <= 0 || height <= 0) return null;

  const format = frame.format;
  if (format !== "I420" && format !== "NV12") return null;

  const buffer = new Uint8Array(frame.allocationSize());
  const layout = await frame.copyTo(buffer);
  const planes = Array.isArray(layout)
    ? layout
    : (layout as { layout?: { offset: number; stride: number }[] })?.layout;
  const yOffset = planes?.[0]?.offset ?? 0;
  const yStride = planes?.[0]?.stride ?? width;
  const yPlane = new Uint8Array(width * height);
  if (yStride === width) {
    yPlane.set(buffer.subarray(yOffset, yOffset + width * height));
  } else {
    for (let row = 0; row < height; row++) {
      yPlane.set(
        buffer.subarray(yOffset + row * yStride, yOffset + row * yStride + width),
        row * width
      );
    }
  }
  return { yPlane, width, height };
}
