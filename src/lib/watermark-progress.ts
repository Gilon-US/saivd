export type WatermarkProgressPhase =
  | "segments"
  | "percent"
  | "mux"
  | "normalize"
  | "generic";

export type WatermarkProgress = {
  /** User-facing status line */
  label: string;
  /** 0–100 when known; null = indeterminate */
  percent: number | null;
  phase: WatermarkProgressPhase;
};

const SEGMENTS_FRACTION_RE = /encoding\s+(\d+)\s*\/\s*(\d+)\s+segments/i;
const SEGMENTS_TOTAL_RE = /encoding\s+(\d+)\s+segments/i;
const PERCENT_RE = /^(\d+(?:\.\d+)?)\s*%$/;

/**
 * Derive UI progress from manager queue_status message strings.
 * Read-only parsing — does not affect watermark encode.
 */
export function parseWatermarkProgress(message: string | null | undefined): WatermarkProgress | null {
  if (!message || !message.trim()) return null;
  const trimmed = message.trim();

  const fraction = trimmed.match(SEGMENTS_FRACTION_RE);
  if (fraction) {
    const done = Number(fraction[1]);
    const total = Number(fraction[2]);
    if (total > 0 && done >= 0) {
      const percent = Math.min(100, Math.round((done / total) * 100));
      return {
        label: `Encoding segment ${done} of ${total}`,
        percent,
        phase: "segments",
      };
    }
  }

  const totalOnly = trimmed.match(SEGMENTS_TOTAL_RE);
  if (totalOnly) {
    const total = Number(totalOnly[1]);
    return {
      label: total > 0 ? `Starting encode (${total} segments)…` : trimmed,
      percent: 0,
      phase: "segments",
    };
  }

  const pct = trimmed.match(PERCENT_RE);
  if (pct) {
    const percent = Math.min(100, Math.max(0, Math.round(Number(pct[1]))));
    return {
      label: `Watermarking ${percent.toFixed(0)}%`,
      percent,
      phase: "percent",
    };
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes("concatenat") || lower.includes("muxing")) {
    return {label: trimmed, percent: 92, phase: "mux"};
  }
  if (
    lower === "downloading" ||
    lower === "normalizing" ||
    lower === "uploading" ||
    lower.startsWith("preparing")
  ) {
    return {label: trimmed, percent: null, phase: "normalize"};
  }

  return {label: trimmed, percent: null, phase: "generic"};
}

/**
 * Prefer structured segment counts from queue_status when present; otherwise parse message text.
 */
export function resolveWatermarkProgress(
  message: string | null | undefined,
  segmentsDone?: number | null,
  segmentsTotal?: number | null,
): WatermarkProgress | null {
  const fromMessage = parseWatermarkProgress(message);
  if (fromMessage?.phase === "mux" || fromMessage?.phase === "percent") {
    return fromMessage;
  }

  const total = segmentsTotal ?? null;
  const done = segmentsDone ?? null;
  if (total != null && total > 0) {
    const safeDone = done != null && done >= 0 ? Math.min(done, total) : 0;
    if (safeDone >= total) {
      return {
        label: "Concatenating and muxing",
        percent: 92,
        phase: "mux",
      };
    }
    const percent = Math.min(100, Math.round((safeDone / total) * 100));
    return {
      label:
        safeDone > 0
          ? `Encoding segment ${safeDone} of ${total}`
          : `Starting encode (${total} segments)…`,
      percent,
      phase: "segments",
    };
  }

  return fromMessage;
}

export function isVideoWatermarking(
  video: {status: string},
  pendingJob?: {failed?: boolean} | null,
): boolean {
  return (video.status === "processing" || Boolean(pendingJob)) && !pendingJob?.failed;
}

export function isVideoNormalizing(video: {
  normalization_status?: string | null;
}): boolean {
  return video.normalization_status === "pending" || video.normalization_status === "normalizing";
}
