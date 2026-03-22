/// <reference lib="webworker" />

/**
 * Web Worker: stateful MP4 demux (mp4box) + WASM H.264 decode (@ffmpeg/ffmpeg) for watermark verification only.
 * Playback stays on the main thread <video> element.
 *
 * Co-located with wasm-watermark-verification-client.ts so Webpack can bundle `new URL('./watermark-verify.worker.ts', import.meta.url)` reliably.
 * Production builds must use `next build` without --turbopack (see package.json); Turbopack fails with "expression is too dynamic" for this worker.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { createFile } from "mp4box";
import type { ISOFile, Movie, MP4BoxBuffer, Sample } from "mp4box";
import { extractYLumaFromYuv420pRaw } from "./yuv420-luma-extract";

const RANGE_STEPS_BYTES = [8 * 1024 * 1024, 16 * 1024 * 1024, 32 * 1024 * 1024];

type WorkerRequest =
  | { id: number; type: "init"; videoUrl: string; baseUrl: string }
  | { id: number; type: "decodeFrame"; frameIndex: number }
  | { id: number; type: "dispose" };

type WorkerResponse =
  | {
      id: number;
      ok: true;
      type: "init";
      videoTrackId: number;
      nbSamples: number;
      width: number;
      height: number;
    }
  | {
      id: number;
      ok: true;
      type: "decodeFrame";
      yPlane: ArrayBuffer;
      width: number;
      height: number;
    }
  | { id: number; ok: true; type: "dispose" }
  | { id: number; ok: false; error: string };

let mp4boxfile: ISOFile | null = null;
let videoUrl = "";
let videoTrackId = 0;
let videoWidth = 0;
let videoHeight = 0;
let nbSamples = 0;
let abortController: AbortController | null = null;
let ffmpeg: FFmpeg | null = null;
let baseUrlForFfmpeg = "";

function attachFileStart(buf: ArrayBuffer, fileStart: number): MP4BoxBuffer {
  const b = buf as MP4BoxBuffer;
  b.fileStart = fileStart;
  return b;
}

async function fetchRange(url: string, byteCount: number, signal: AbortSignal): Promise<ArrayBuffer | null> {
  try {
    const end = Math.max(0, byteCount - 1);
    const response = await fetch(url, {
      mode: "cors",
      signal,
      headers: {Range: `bytes=0-${end}`},
    });
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

async function fetchByteRange(url: string, start: number, end: number, signal: AbortSignal): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url, {
      mode: "cors",
      signal,
      headers: {Range: `bytes=${start}-${end}`},
    });
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

/** Convert MP4 AVC length-prefixed NAL units to Annex B (start codes). */
function avccToAnnexB(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let pos = 0;
  const startCode = new Uint8Array([0, 0, 0, 1]);
  while (pos + 4 <= data.length) {
    const len = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
    pos += 4;
    if (len <= 0 || pos + len > data.length) break;
    const nal = data.subarray(pos, pos + len);
    const merged = new Uint8Array(startCode.length + nal.length);
    merged.set(startCode);
    merged.set(nal, startCode.length);
    chunks.push(merged);
    pos += len;
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function ensureMoovParsed(url: string, signal: AbortSignal): Promise<Movie> {
  for (const byteCount of RANGE_STEPS_BYTES) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    mp4boxfile = createFile() as ISOFile;
    const file = mp4boxfile;
    const infoPromise = new Promise<Movie>((resolve, reject) => {
      file.onReady = resolve;
      file.onError = (_mod, msg) => reject(new Error(msg ?? "mp4box error"));
    });
    const buf = await fetchRange(url, byteCount, signal);
    if (!buf) continue;
    file.appendBuffer(attachFileStart(buf.slice(0), 0));
    if (file.readySent) {
      return await infoPromise;
    }
  }
  throw new Error("MP4 moov not parsed — try larger Range or check faststart");
}

async function ensureFfmpegLoaded(base: string): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;
  const ff = new FFmpeg();
  // Same-origin URLs under /public/ffmpeg — do NOT use toBlobURL here. @ffmpeg/ffmpeg's
  // inner worker does `import(coreURL)`; blob: URLs are mis-handled by Webpack's runtime
  // ("Cannot find module 'blob:https://…'") on Netlify/production bundles.
  const origin = base.replace(/\/$/, "");
  const coreURL = `${origin}/ffmpeg/ffmpeg-core.js`;
  const wasmURL = `${origin}/ffmpeg/ffmpeg-core.wasm`;
  await ff.load({coreURL, wasmURL});
  ffmpeg = ff;
  return ff;
}

async function ensureSampleData(trackId: number, sampleIndex: number, signal: AbortSignal): Promise<Sample> {
  if (!mp4boxfile) throw new Error("MP4 not initialized");
  const trak = mp4boxfile.getTrackById(trackId);
  if (!trak?.samples?.[sampleIndex]) {
    throw new Error(`Invalid sample index ${sampleIndex}`);
  }
  const sample = trak.samples[sampleIndex];
  if (sample.data && sample.alreadyRead === sample.size) {
    return sample as Sample;
  }
  const start = sample.offset;
  const end = sample.offset + sample.size - 1;
  const buf = await fetchByteRange(videoUrl, start, end, signal);
  if (!buf) throw new Error(`Range fetch failed for sample ${sampleIndex}`);
  const u8 = new Uint8Array(buf);
  if (u8.byteLength !== sample.size) {
    throw new Error(
      `Sample ${sampleIndex} size mismatch: expected ${sample.size} bytes, got ${u8.byteLength} (Range GET may be ignored — check presigned URL / CORS)`
    );
  }
  // Do NOT use appendBuffer + getTrackSample for random access: mp4box appendBuffer
  // parses the chunk and cleanBuffers() drops fully "used" buffers before getSample
  // can memcpy, so sample data never appears. We only need moov for offsets/sizes.
  sample.data = u8;
  sample.alreadyRead = sample.size;
  return sample as Sample;
}

async function decodeFrameToY(frameIndex: number, signal: AbortSignal): Promise<{yPlane: Uint8Array; width: number; height: number}> {
  const ff = await ensureFfmpegLoaded(baseUrlForFfmpeg);
  const sample = await ensureSampleData(videoTrackId, frameIndex, signal);
  const annexB = avccToAnnexB(sample.data!);
  if (annexB.length === 0) {
    throw new Error("Empty Annex-B payload after AVCC conversion");
  }
  await ff.writeFile("in.h264", annexB);
  // ffmpeg.wasm often writes **empty** output for `-pix_fmt gray`; use yuv420p and unpack Y
  // with stride (linesize ≥ width). See `yuv420-luma-extract.ts`.
  await ff.exec(
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "h264",
      "-i",
      "in.h264",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "yuv420p",
      "out.yuv",
    ],
    undefined,
    {signal}
  );
  const raw = await ff.readFile("out.yuv");
  let full: Uint8Array;
  if (raw instanceof Uint8Array) {
    full = raw;
  } else if (typeof raw === "string") {
    throw new Error("Unexpected text output from ffmpeg rawvideo");
  } else {
    full = new Uint8Array(raw as ArrayBuffer);
  }
  const yPlane = extractYLumaFromYuv420pRaw(full, videoWidth, videoHeight);
  try {
    await ff.deleteFile("in.h264");
    await ff.deleteFile("out.yuv");
  } catch {
    /* ignore */
  }
  return {yPlane, width: videoWidth, height: videoHeight};
}

function resetSession() {
  try {
    ffmpeg?.terminate();
  } catch {
    /* ignore */
  }
  ffmpeg = null;
  mp4boxfile = null;
  videoUrl = "";
  videoTrackId = 0;
  videoWidth = 0;
  videoHeight = 0;
  nbSamples = 0;
  try {
    abortController?.abort();
  } catch {
    /* ignore */
  }
  abortController = null;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;

  try {
    if (msg.type === "dispose") {
      resetSession();
      const r: WorkerResponse = {id: msg.id, ok: true, type: "dispose"};
      self.postMessage(r);
      return;
    }

    if (msg.type === "init") {
      resetSession();
      videoUrl = msg.videoUrl;
      baseUrlForFfmpeg = msg.baseUrl.replace(/\/$/, "");
      abortController = new AbortController();
      const signal = abortController.signal;

      const info = await ensureMoovParsed(msg.videoUrl, signal);
      const vTrack = info.videoTracks?.[0];
      if (!vTrack) {
        throw new Error("No video track in MP4");
      }
      videoTrackId = vTrack.id;
      videoWidth = vTrack.video?.width ?? vTrack.track_width ?? 0;
      videoHeight = vTrack.video?.height ?? vTrack.track_height ?? 0;
      if (!mp4boxfile) throw new Error("MP4 file missing");
      const trak = mp4boxfile.getTrackById(videoTrackId);
      nbSamples = trak?.samples?.length ?? 0;
      if (!videoWidth || !videoHeight || !nbSamples) {
        throw new Error("Could not read video dimensions or sample count");
      }

      const r: WorkerResponse = {
        id: msg.id,
        ok: true,
        type: "init",
        videoTrackId,
        nbSamples,
        width: videoWidth,
        height: videoHeight,
      };
      self.postMessage(r);
      return;
    }

    if (msg.type === "decodeFrame") {
      if (!mp4boxfile || !videoUrl) {
        throw new Error("Session not initialized");
      }
      const signal = abortController?.signal ?? new AbortController().signal;
      if (msg.frameIndex < 0 || msg.frameIndex >= nbSamples) {
        throw new Error(`frameIndex ${msg.frameIndex} out of range (nbSamples=${nbSamples})`);
      }
      const {yPlane, width, height} = await decodeFrameToY(msg.frameIndex, signal);
      const buf = yPlane.buffer.slice(yPlane.byteOffset, yPlane.byteOffset + yPlane.byteLength) as ArrayBuffer;
      const r: WorkerResponse = {
        id: msg.id,
        ok: true,
        type: "decodeFrame",
        yPlane: buf,
        width,
        height,
      };
      self.postMessage(r, [buf]);
      return;
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const id = "id" in msg ? msg.id : 0;
    self.postMessage({id, ok: false, error: err} satisfies WorkerResponse);
  }
};
