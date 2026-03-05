/**
 * Capture frame 0 from a video URL using WebCodecs (fetch → demux → decode) and return the
 * raw Y (luma) plane. This matches the backend's Y source (codec output) for accurate
 * user ID extraction and RSA verification. Falls back to null if WebCodecs or demux fails.
 *
 * WASM: public/wasm/web-demuxer.wasm must be served (copied from web-demuxer package).
 */

export type WebCodecsFrame0Result = {
  yPlane: Uint8Array;
  width: number;
  height: number;
};

const WASM_PATH = "/wasm/web-demuxer.wasm";

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
  if (!isWebCodecsSupported()) return null;

  let demuxer: import("web-demuxer").WebDemuxer | null = null;

  try {
    const { WebDemuxer } = await import("web-demuxer");
    demuxer = new WebDemuxer({ wasmFilePath: WASM_PATH });

    const response = await fetch(videoUrl, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const file = new File([blob], "video.mp4", { type: blob.type || "video/mp4" });
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
  } catch {
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
 * Extract the Y (luma) plane from a VideoFrame. Supports I420 (and NV12 if Y is contiguous).
 */
function extractYPlaneFromVideoFrame(frame: VideoFrame): WebCodecsFrame0Result | null {
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

The `copyTo` is async but we're not awaiting it. Fixing the function.
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace