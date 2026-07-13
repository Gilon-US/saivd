import {createFile} from "mp4box";
import type {MP4BoxBuffer, Movie} from "mp4box";

/** Display aspect ratio (width / height) from coded dimensions + SAR when present. */
export function displayAspectFromTrack(
  width: number,
  height: number,
  sampleAspectRatio?: string | null,
): number | null {
  if (width <= 0 || height <= 0) return null;
  let sarNum = 1;
  let sarDen = 1;
  if (sampleAspectRatio && sampleAspectRatio.includes(":")) {
    const [n, d] = sampleAspectRatio.split(":").map((v) => Number(v.trim()));
    if (Number.isFinite(n) && Number.isFinite(d) && n > 0 && d > 0) {
      sarNum = n;
      sarDen = d;
    }
  }
  return ((width * sarNum) / sarDen) / height;
}

function displayAspectFromMovie(info: Movie): number | null {
  const track = info.videoTracks?.[0];
  if (!track) return null;
  const width = track.video?.width ?? track.track_width;
  const height = track.video?.height ?? track.track_height;
  return displayAspectFromTrack(width, height, (track as {sample_aspect_ratio?: string | null}).sample_aspect_ratio);
}

/**
 * Parse display aspect ratio from an MP4 buffer (moov must be present in the buffer).
 * Does not touch watermarking — used for player layout only.
 */
export function probeDisplayAspectFromArrayBuffer(
  buffer: ArrayBuffer,
  fileStart = 0,
): Promise<number | null> {
  return new Promise((resolve) => {
    const mp4 = createFile();
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(value);
    };

    const timeoutId = window.setTimeout(() => finish(null), 8000);

    mp4.onReady = (info) => {
      finish(displayAspectFromMovie(info));
    };
    mp4.onError = () => finish(null);

    const mp4Buffer = buffer.slice(0) as MP4BoxBuffer;
    mp4Buffer.fileStart = fileStart;
    mp4.appendBuffer(mp4Buffer);
    mp4.flush();
  });
}

/** Probe display aspect from a local File (full read). */
export async function probeDisplayAspectFromFile(file: File): Promise<number | null> {
  const buffer = await file.arrayBuffer();
  return probeDisplayAspectFromArrayBuffer(buffer);
}

/**
 * Probe display aspect from a remote MP4 URL. Tries head + tail ranges so moov-at-end files work.
 */
export async function probeDisplayAspectFromUrl(url: string): Promise<number | null> {
  const chunkSize = 6 * 1024 * 1024;

  const tryRange = async (rangeHeader: string, fileStart: number): Promise<number | null> => {
    const response = await fetch(url, {headers: {Range: rangeHeader}});
    if (!response.ok && response.status !== 206) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    return probeDisplayAspectFromArrayBuffer(buffer, fileStart);
  };

  const headAspect = await tryRange(`bytes=0-${chunkSize - 1}`, 0);
  if (headAspect != null) return headAspect;

  const tailResponse = await fetch(url, {method: "HEAD"});
  const contentLength = Number(tailResponse.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength <= chunkSize) return null;

  const start = Math.max(0, contentLength - chunkSize);
  return tryRange(`bytes=${start}-${contentLength - 1}`, start);
}

/** Horizontal scale to correct watermarked playback when SAR metadata is absent. */
export function watermarkedPlaybackScaleX(
  codedWidth: number,
  codedHeight: number,
  sourceDisplayAspect: number,
): number {
  if (codedWidth <= 0 || codedHeight <= 0 || sourceDisplayAspect <= 0) return 1;
  const codedAspect = codedWidth / codedHeight;
  if (!Number.isFinite(codedAspect) || codedAspect <= 0) return 1;
  const scale = sourceDisplayAspect / codedAspect;
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  // Ignore tiny drift (e.g. 16:9 watermarked landscape).
  if (Math.abs(scale - 1) < 0.02) return 1;
  return scale;
}
