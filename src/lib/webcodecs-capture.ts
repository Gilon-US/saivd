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

/**
 * Byte ranges for partial fetches. Watermarked videos are normalized to faststart (moov at start)
 * on the backend. Some files have large moov/STCO so we try 8 MB first to avoid 1→4→8 round-trips.
 */
const RANGE_STEPS_BYTES = [
  8 * 1024 * 1024,   // 8 MB – many faststart files need this for moov/stco; one request vs 1+4+8
  16 * 1024 * 1024,  // 16 MB – fallback for very large moov
];

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
 * Fetch the first `byteCount` bytes of the video (HTTP Range). Returns null on failure.
 */
async function fetchRange(videoUrl: string, byteCount: number): Promise<ArrayBuffer | null> {
  try {
    const end = Math.max(0, byteCount - 1);
    const response = await fetch(videoUrl, {
      mode: "cors",
      headers: {
        Range: `bytes=0-${end}`,
      },
    });

    if (!response.ok) {
      console.warn("[WebCodecs] range fetch failed:", response.status, response.statusText);
      return null;
    }

    // We accept both 206 (partial) and 200 (full) here; caller only cares that we have bytes.
    const buffer = await response.arrayBuffer();
    const isPartial = response.status === 206;
    console.log("[Frame0Decode] Range fetch", {
      requestedBytes: byteCount,
      receivedBytes: buffer.byteLength,
      status: response.status,
      partial: isPartial,
      warning: !isPartial ? "Server returned 200 (full file) not 206 (partial) – check Range support" : undefined,
      t: Math.round(performance.now()),
    });
    return buffer;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[WebCodecs] fetchRange failed:", msg);
    return null;
  }
}

/**
 * Demux and decode frame 0 from a buffer containing the start of a faststart MP4.
 * Returns null if demux or decode fails for any reason.
 */
async function demuxFrameFromBuffer(buffer: ArrayBuffer, frameIndex = 0): Promise<WebCodecsFrame0Result | null> {
  let demuxer: import("web-demuxer").WebDemuxer | null = null;
  try {
    const file = new File([buffer], "video.mp4", {type: "video/mp4"});
    const {WebDemuxer} = await import("web-demuxer");
    demuxer = new WebDemuxer({wasmFilePath: getWasmAbsoluteUrl()});
    await demuxer.load(file);

    const config = await demuxer.getDecoderConfig("video");
    if (!config) {
      console.warn("[WebCodecs] demuxFrame0FromBuffer: missing video decoder config");
      return null;
    }

    // Decode requested frame index by seeking in seconds (fallback ~30fps).
    // For frameIndex=0 this is exact frame-0 seek.
    const targetTimeSec = frameIndex <= 0 ? 0 : frameIndex / 30;
    const chunk = await demuxer.seek("video", targetTimeSec);
    if (!chunk) {
      console.warn("[WebCodecs] demuxFrameFromBuffer: no chunk at target time (possibly insufficient data)", {
        frameIndex,
        targetTimeSec,
      });
      return null;
    }

    const frame = await decodeOneFrame(config, chunk);
    if (!frame) {
      console.warn("[WebCodecs] demuxFrameFromBuffer: decodeOneFrame returned null", {frameIndex});
      return null;
    }

    try {
      const y = await extractYPlaneFromVideoFrame(frame);
      return y;
    } finally {
      frame.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[WebCodecs] demuxFrameFromBuffer failed:", msg, {frameIndex});
    return null;
  } finally {
    if (demuxer) {
      demuxer.destroy();
    }
  }
}

/**
 * Decode frame 0 from the video URL via WebCodecs and return the I420 Y plane.
 * Returns null if unsupported, fetch fails, demux fails, or decode fails.
 */
export async function captureFrameYFromUrl(
  videoUrl: string,
  frameIndex = 0
): Promise<WebCodecsFrame0Result | null> {
  const t0 = performance.now();
  console.log("[Frame0Decode] captureFrameYFromUrl START", {
    frameIndex,
    urlSnippet: videoUrl.slice(-60),
    t: Math.round(t0),
  });

  if (!isWebCodecsSupported()) {
    console.warn("[WebCodecs] VideoDecoder/EncodedVideoChunk/VideoFrame not available");
    return null;
  }

  try {
    const wasmCheck = await checkWasmUrl();
    if (!wasmCheck.ok) {
      console.warn("[WebCodecs] WASM URL check failed:", wasmCheck.status ?? wasmCheck.error, wasmCheck.contentType ?? "", wasmCheck.error ?? "");
    }

    // Try range steps; demux can fail with "corrupted STCO atom" / "reached eof" if moov or chunk table is truncated.
    let totalBytesFetched = 0;
    for (let i = 0; i < RANGE_STEPS_BYTES.length; i++) {
      const byteCount = RANGE_STEPS_BYTES[i];
      console.log("[Frame0Decode] Trying range step", { step: i + 1, requestedBytes: byteCount, t: Math.round(performance.now()) });
      const buffer = await fetchRange(videoUrl, byteCount);
      if (!buffer) {
        if (i === 0) console.warn("[WebCodecs] captureFrame0YFromUrl: range fetch failed");
        continue;
      }
      totalBytesFetched += buffer.byteLength;
      const result = await demuxFrameFromBuffer(buffer, frameIndex);
      if (result) {
        const totalMB = (totalBytesFetched / (1024 * 1024)).toFixed(2);
        console.log("[Frame0Decode] captureFrameYFromUrl END success", {
          frameIndex,
          usedStep: i + 1,
          requestedBytes: byteCount,
          receivedBytes: buffer.byteLength,
          totalBytesFetched,
          totalMB: `${totalMB} MB (Range only; full video not loaded)`,
          elapsedMs: Math.round(performance.now() - t0),
        });
        return result;
      }
      if (i < RANGE_STEPS_BYTES.length - 1) {
        console.warn(
          "[Frame0Decode] Demux failed (truncated moov/STCO?); trying larger range",
          { requestedBytes: byteCount, totalBytesFetched }
        );
      }
    }
    console.warn(
      "[Frame0Decode] captureFrameYFromUrl END failed (insufficient data)",
      { totalBytesFetched, elapsedMs: Math.round(performance.now() - t0) }
    );
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.warn("[WebCodecs] captureFrameYFromUrl failed:", msg, {frameIndex});
    if (stack) console.warn("[WebCodecs] stack:", stack);
    return null;
  }
}

export async function captureFrame0YFromUrl(
  videoUrl: string
): Promise<WebCodecsFrame0Result | null> {
  return captureFrameYFromUrl(videoUrl, 0);
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
