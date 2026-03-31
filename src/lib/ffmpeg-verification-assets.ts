/**
 * Single source of truth for ffmpeg.wasm URLs used by the watermark verification worker
 * and optional HTTP prewarm on the main thread (`/public/ffmpeg/`).
 */

export const FFMPEG_CORE_JS_PATH = "/ffmpeg/ffmpeg-core.js";
export const FFMPEG_CORE_WASM_PATH = "/ffmpeg/ffmpeg-core.wasm";

export function getFfmpegCoreUrls(origin: string): {coreURL: string; wasmURL: string} {
  const base = origin.replace(/\/$/, "");
  return {
    coreURL: `${base}${FFMPEG_CORE_JS_PATH}`,
    wasmURL: `${base}${FFMPEG_CORE_WASM_PATH}`,
  };
}

/** Best-effort cache warm for ffmpeg static assets (browser only). */
export function prewarmFfmpegVerificationAssets(): void {
  if (typeof window === "undefined") return;
  const {coreURL, wasmURL} = getFfmpegCoreUrls(window.location.origin);
  void fetch(coreURL, {mode: "cors", credentials: "omit"}).catch(() => {});
  void fetch(wasmURL, {mode: "cors", credentials: "omit"}).catch(() => {});
}
