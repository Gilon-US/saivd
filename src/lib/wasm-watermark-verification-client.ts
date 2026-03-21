/**
 * Lazy-loaded Web Worker + ffmpeg.wasm for watermark verification (Y plane) only.
 * Sessions are stateful per videoUrl; call disposeWasmVerificationSession when the player closes.
 */

export type WasmFrameYResult = {
  yPlane: Uint8Array;
  width: number;
  height: number;
};

type InitOk = {
  id: number;
  ok: true;
  type: "init";
  videoTrackId: number;
  nbSamples: number;
  width: number;
  height: number;
};

type DecodeOk = {
  id: number;
  ok: true;
  type: "decodeFrame";
  yPlane: ArrayBuffer;
  width: number;
  height: number;
};

type DisposeOk = {id: number; ok: true; type: "dispose"};
type ErrMsg = {id: number; ok: false; error: string};
type OkMsg = InitOk | DecodeOk | DisposeOk;

let worker: Worker | null = null;
let requestSeq = 0;
const pending = new Map<
  number,
  {resolve: (v: OkMsg) => void; reject: (e: Error) => void}
>();

let activeUrl: string | null = null;
let initMeta: {nbSamples: number; width: number; height: number} | null = null;

function nextId(): number {
  return ++requestSeq;
}

function baseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}

function attachWorkerHandlers(w: Worker) {
  w.onmessage = (ev: MessageEvent<OkMsg | ErrMsg>) => {
    const data = ev.data;
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    if ("ok" in data && data.ok === false) {
      p.reject(new Error(data.error));
    } else {
      p.resolve(data as OkMsg);
    }
  };
  w.onerror = (err) => {
    for (const [, pr] of pending) {
      pr.reject(new Error(err.message ?? "Worker error"));
    }
    pending.clear();
  };
}

function createWorker(): Worker {
  const w = new Worker(new URL("../workers/watermark-verify.worker.ts", import.meta.url), {
    type: "module",
  });
  attachWorkerHandlers(w);
  return w;
}

function ensureWorker(): Worker {
  if (!worker) {
    worker = createWorker();
  }
  return worker;
}

function send<T extends OkMsg>(payload: Record<string, unknown>): Promise<T> {
  const w = ensureWorker();
  const id = nextId();
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: (msg: OkMsg) => resolve(msg as T),
      reject,
    });
    w.postMessage({...payload, id});
  });
}

/**
 * Initialize stateful demux + MP4 parse for this URL (Range fetch moov). Safe to call once per open.
 */
export async function ensureWasmVerificationSession(
  videoUrl: string
): Promise<{nbSamples: number; width: number; height: number} | null> {
  if (activeUrl === videoUrl && initMeta) {
    return initMeta;
  }
  await disposeWasmVerificationSession();
  const data = await send<InitOk>({
    type: "init",
    videoUrl,
    baseUrl: baseUrl(),
  });
  activeUrl = videoUrl;
  initMeta = {
    nbSamples: data.nbSamples,
    width: data.width,
    height: data.height,
  };
  return initMeta;
}

/**
 * Decode a single frame index (0-based) to luma via WASM ffmpeg. Requires ensureWasmVerificationSession first.
 */
export async function getFrameYFromWasm(
  videoUrl: string,
  frameIndex: number
): Promise<WasmFrameYResult | null> {
  const meta = await ensureWasmVerificationSession(videoUrl);
  if (!meta || frameIndex < 0 || frameIndex >= meta.nbSamples) {
    return null;
  }
  const data = await send<DecodeOk>({
    type: "decodeFrame",
    frameIndex,
  });
  return {
    yPlane: new Uint8Array(data.yPlane),
    width: data.width,
    height: data.height,
  };
}

/**
 * Terminate worker, abort fetches, clear session. Call when VideoPlayer closes or verification disables.
 */
export async function disposeWasmVerificationSession(): Promise<void> {
  activeUrl = null;
  initMeta = null;
  const w = worker;
  if (!w) return;
  worker = null;
  const id = nextId();
  try {
    await new Promise<void>((resolve, reject) => {
      pending.set(id, {
        resolve: (msg: OkMsg) => {
          if (msg.type === "dispose") resolve();
        },
        reject,
      });
      w.postMessage({id, type: "dispose"});
    });
  } catch {
    /* ignore */
  }
  try {
    w.terminate();
  } catch {
    /* ignore */
  }
  pending.clear();
}
