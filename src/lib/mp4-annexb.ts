/**
 * H.264-in-MP4 helpers for decoding a single sample: AVCC (length-prefixed NAL units) to Annex-B, and the
 * SPS/PPS from the track's avcC box as an Annex-B prefix. Used by the verification worker
 * (watermark-verify.worker.ts) so each keyframe (IDR) sample can be decoded on its own.
 */
import type { ISOFile } from "mp4box";

export function avccToAnnexB(data: Uint8Array): Uint8Array {
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

type AvcCBoxLike = {
  SPS?: Array<{length?: number; data?: Uint8Array}>;
  PPS?: Array<{length?: number; data?: Uint8Array}>;
};

export function getAvcCAnnexBPrefix(iso: ISOFile, trackId: number): Uint8Array | null {
  const trak = iso.getTrackById(trackId) as {
    mdia?: {minf?: {stbl?: {stsd?: {entries?: Array<{avcC?: AvcCBoxLike}>}}}};
  } | null;
  const avcC = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.avcC;
  if (!avcC) return null;
  const startCode = new Uint8Array([0, 0, 0, 1]);
  const chunks: Uint8Array[] = [];
  for (const s of avcC.SPS ?? []) {
    const d = s?.data;
    if (d?.length) {
      const m = new Uint8Array(4 + d.length);
      m.set(startCode);
      m.set(d, 4);
      chunks.push(m);
    }
  }
  for (const p of avcC.PPS ?? []) {
    const d = p?.data;
    if (d?.length) {
      const m = new Uint8Array(4 + d.length);
      m.set(startCode);
      m.set(d, 4);
      chunks.push(m);
    }
  }
  if (chunks.length === 0) return null;
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function concatUint8(a: Uint8Array, b: Uint8Array): Uint8Array {
  const o = new Uint8Array(a.length + b.length);
  o.set(a);
  o.set(b, a.length);
  return o;
}
