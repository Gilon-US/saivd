/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Drop-in replacement for `@ffmpeg/ffmpeg/dist/esm/worker.js` with
 * webpackIgnore on the dynamic import so Webpack does not treat same-origin
 * coreURL / CDN URLs as chunk IDs ("Cannot find module 'https://...'").
 *
 * Wired via `NormalModuleReplacementPlugin` in `next.config.ts`.
 */
import {CORE_URL, FFMessageType} from "@ffmpeg/ffmpeg-esm/const.js";
import {
  ERROR_UNKNOWN_MESSAGE_TYPE,
  ERROR_NOT_LOADED,
  ERROR_IMPORT_FAILURE,
} from "@ffmpeg/ffmpeg-esm/errors.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors upstream worker.js
let ffmpeg: any = null;

const load = async ({
  coreURL: _coreURL,
  wasmURL: _wasmURL,
  workerURL: _workerURL,
}: {
  coreURL?: string;
  wasmURL?: string;
  workerURL?: string;
}) => {
  const first = !ffmpeg;
  const w = self as unknown as {createFFmpegCore?: (opts: unknown) => Promise<unknown>};
  try {
    if (!_coreURL) _coreURL = CORE_URL;
    importScripts(_coreURL);
  } catch {
    if (!_coreURL || _coreURL === CORE_URL) _coreURL = CORE_URL.replace("/umd/", "/esm/");
    // Module worker: load ffmpeg-core without Webpack turning the URL into a chunk request.
    const mod = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      _coreURL
    );
    const create = (mod as {default?: unknown}).default;
    w.createFFmpegCore = create as (opts: unknown) => Promise<unknown>;
    if (!w.createFFmpegCore) {
      throw ERROR_IMPORT_FAILURE;
    }
  }
  const coreURL = _coreURL;
  const wasmURL = _wasmURL ? _wasmURL : _coreURL.replace(/.js$/g, ".wasm");
  const workerURL = _workerURL ? _workerURL : _coreURL.replace(/.js$/g, ".worker.js");
  ffmpeg = await w.createFFmpegCore!({
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({wasmURL, workerURL}))}`,
  });
  ffmpeg.setLogger((data: unknown) => self.postMessage({type: FFMessageType.LOG, data}));
  ffmpeg.setProgress((data: unknown) =>
    self.postMessage({
      type: FFMessageType.PROGRESS,
      data,
    })
  );
  return first;
};

const exec = ({args, timeout = -1}: {args: string[]; timeout?: number}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const ffprobe = ({args, timeout = -1}: {args: string[]; timeout?: number}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  ffmpeg.setTimeout(timeout);
  ffmpeg.ffprobe(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const writeFile = ({path, data}: {path: string; data: Uint8Array}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  ffmpeg.FS.writeFile(path, data);
  return true;
};

const readFile = ({path, encoding}: {path: string; encoding?: string}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  return ffmpeg.FS.readFile(path, {encoding});
};

const deleteFile = ({path}: {path: string}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  ffmpeg.FS.unlink(path);
  return true;
};

const rename = ({oldPath, newPath}: {oldPath: string; newPath: string}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  ffmpeg.FS.rename(oldPath, newPath);
  return true;
};

const createDir = ({path}: {path: string}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  ffmpeg.FS.mkdir(path);
  return true;
};

const listDir = ({path}: {path: string}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  const names = ffmpeg.FS.readdir(path);
  const nodes: {name: string; isDir: boolean}[] = [];
  for (const name of names) {
    const stat = ffmpeg.FS.stat(`${path}/${name}`);
    const isDir = ffmpeg.FS.isDir(stat.mode);
    nodes.push({name, isDir});
  }
  return nodes;
};

const deleteDir = ({path}: {path: string}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  ffmpeg.FS.rmdir(path);
  return true;
};

const mount = ({
  fsType,
  options,
  mountPoint,
}: {
  fsType: string;
  options: unknown;
  mountPoint: string;
}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  const fs = ffmpeg.FS.filesystems[fsType];
  if (!fs) return false;
  ffmpeg.FS.mount(fs, options, mountPoint);
  return true;
};

const unmount = ({mountPoint}: {mountPoint: string}) => {
  if (!ffmpeg) throw ERROR_NOT_LOADED;
  ffmpeg.FS.unmount(mountPoint);
  return true;
};

self.onmessage = async ({data: {id, type, data: _data}}: MessageEvent<{id: number; type: string; data: unknown}>) => {
  const trans: Transferable[] = [];
  let data: unknown;
  try {
    if (type !== FFMessageType.LOAD && !ffmpeg) throw ERROR_NOT_LOADED;
    switch (type) {
      case FFMessageType.LOAD:
        data = await load(_data as Parameters<typeof load>[0]);
        break;
      case FFMessageType.EXEC:
        data = exec(_data as {args: string[]; timeout?: number});
        break;
      case FFMessageType.FFPROBE:
        data = ffprobe(_data as {args: string[]; timeout?: number});
        break;
      case FFMessageType.WRITE_FILE:
        data = writeFile(_data as {path: string; data: Uint8Array});
        break;
      case FFMessageType.READ_FILE:
        data = readFile(_data as {path: string; encoding?: string});
        break;
      case FFMessageType.DELETE_FILE:
        data = deleteFile(_data as {path: string});
        break;
      case FFMessageType.RENAME:
        data = rename(_data as {oldPath: string; newPath: string});
        break;
      case FFMessageType.CREATE_DIR:
        data = createDir(_data as {path: string});
        break;
      case FFMessageType.LIST_DIR:
        data = listDir(_data as {path: string});
        break;
      case FFMessageType.DELETE_DIR:
        data = deleteDir(_data as {path: string});
        break;
      case FFMessageType.MOUNT:
        data = mount(_data as {fsType: string; options: unknown; mountPoint: string});
        break;
      case FFMessageType.UNMOUNT:
        data = unmount(_data as {mountPoint: string});
        break;
      default:
        throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }
  } catch (e) {
    self.postMessage({
      id,
      type: FFMessageType.ERROR,
      data: e instanceof Error ? e.toString() : String(e),
    });
    return;
  }
  if (data instanceof Uint8Array) {
    trans.push(data.buffer);
  }
  self.postMessage({id, type, data}, trans);
};
