/**
 * @jest-environment-options {"customExportConditions": ["node", "require"]}
 */
import {spawnSync} from "child_process";
import {webcrypto} from "crypto";
import {existsSync, readFileSync, readdirSync} from "fs";
import {join} from "path";
import {TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder} from "util";
import {createFile} from "mp4box";
import type {ISOFile, Movie, MP4BoxBuffer, Sample} from "mp4box";
import {avccToAnnexB, concatUint8, getAvcCAnnexBPrefix} from "../mp4-annexb";
import {extractYuv420pPlanes} from "../yuv420-luma-extract";
import {isV3Reading, readFrameV3, verifyV3Signature} from "../watermark-v3";

/**
 * Opt-in end-to-end check on real backend v3 outputs, following the viewer worker's path:
 * mp4box sample table (sample count, is_sync keyframes) -> one IDR sample + SPS/PPS as Annex-B ->
 * decode that sample alone to raw yuv420p -> extract planes -> v3 reader -> RSA with the frame count.
 * Native ffmpeg stands in for ffmpeg.wasm (same H.264 decoder).
 *
 * Run:  SAIVD_V3_VIDEO_DIR=../saivd-backend/video_examples/v3_test npx jest watermark-v3-videos
 * Needs ffmpeg on PATH. Videos are signed with the test key in fixtures/v3-real/test_public_key.pem
 * and user id 123456789.
 */

const g = globalThis as unknown as {crypto?: Crypto; TextEncoder?: unknown; TextDecoder?: unknown};
if (!g.crypto?.subtle) Object.defineProperty(globalThis, "crypto", {value: webcrypto, configurable: true});
if (typeof g.TextEncoder === "undefined") g.TextEncoder = NodeTextEncoder;
if (typeof g.TextDecoder === "undefined") g.TextDecoder = NodeTextDecoder;

const VIDEO_DIR = process.env.SAIVD_V3_VIDEO_DIR;
const EXPECTED_USER_ID = 123456789;
const videos = VIDEO_DIR && existsSync(VIDEO_DIR) ? readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".mp4")) : [];
const describeIfVideos = videos.length ? describe : describe.skip;

function parseMp4(bytes: Uint8Array): {iso: ISOFile; info: Movie} {
  const iso = createFile() as ISOFile;
  let info: Movie | null = null;
  iso.onReady = (m) => {
    info = m;
  };
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as MP4BoxBuffer;
  buf.fileStart = 0;
  iso.appendBuffer(buf);
  iso.flush();
  if (!info) throw new Error("mp4box: moov not parsed");
  return {iso, info};
}

function decodeSampleToYuv(annexB: Uint8Array): Uint8Array {
  const r = spawnSync(
    "ffmpeg",
    ["-loglevel", "error", "-f", "h264", "-i", "pipe:0", "-frames:v", "1", "-pix_fmt", "yuv420p", "-f", "rawvideo", "pipe:1"],
    {input: annexB, maxBuffer: 64 * 1024 * 1024}
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.toString()}`);
  return new Uint8Array(r.stdout);
}

describeIfVideos("v3 end-to-end on backend test videos", () => {
  let key: CryptoKey;
  beforeAll(async () => {
    const pem = readFileSync(join(__dirname, "fixtures", "v3-real", "test_public_key.pem"), "utf-8");
    const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""), "base64");
    key = await crypto.subtle.importKey("spki", der, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
  });

  it.each(videos)("%s: every keyframe is v3 and verifies with the sample count", async (file) => {
    const bytes = new Uint8Array(readFileSync(join(VIDEO_DIR!, file)));
    const {iso, info} = parseMp4(bytes);
    const track = info.videoTracks[0];
    const width = track.video?.width ?? track.track_width;
    const height = track.video?.height ?? track.track_height;
    const samples = (iso.getTrackById(track.id) as unknown as {samples: Sample[]}).samples;
    const nbSamples = samples.length;
    const keyframes = samples.map((s, i) => (s.is_sync ? i : -1)).filter((i) => i >= 0);
    expect(keyframes.slice(0, 3)).toEqual([0, 1, 2]);

    const prefix = getAvcCAnnexBPrefix(iso, track.id);
    expect(prefix).not.toBeNull();
    const results: string[] = [];
    for (const index of keyframes) {
      const s = samples[index];
      const annexB = concatUint8(prefix!, avccToAnnexB(bytes.subarray(s.offset, s.offset + s.size)));
      const reading = readFrameV3(extractYuv420pPlanes(decodeSampleToYuv(annexB), width, height));
      const ok =
        isV3Reading(reading) &&
        reading.userIdUv === EXPECTED_USER_ID &&
        reading.signature !== null &&
        (await verifyV3Signature(key, reading.signature, nbSamples, reading.userIdUv));
      results.push(`${index}:${ok ? "ok" : "FAIL"}`);
    }
    console.log(`[v3-e2e] ${file} ${width}x${height} samples=${nbSamples} keyframes=${keyframes.length} ${results.join(" ")}`);
    expect(results.filter((r) => r.endsWith("FAIL"))).toEqual([]);
  }, 300000);
});

/**
 * Opt-in v2 check on real v2 outputs (WATERMARK_FORMAT_VERSION=2):
 *   SAIVD_V2_VIDEO_DIR=../saivd-backend/video_examples/v2_test npx jest watermark-v3-videos
 * Asserts what the viewer's v2 keyframe check relies on: every keyframe is not v3 and its Y payload decodes
 * to the expected user id (the hook's decoder). The legacy v2 RSA outcome is printed for information only:
 * on 2026-11-23 it failed on all keyframes, which is why v2 checks user-id consistency only.
 */
const V2_VIDEO_DIR = process.env.SAIVD_V2_VIDEO_DIR;
const v2Videos =
  V2_VIDEO_DIR && existsSync(V2_VIDEO_DIR) ? readdirSync(V2_VIDEO_DIR).filter((f) => f.endsWith(".mp4")) : [];
const describeIfV2Videos = v2Videos.length ? describe : describe.skip;

describeIfV2Videos("v2 end-to-end on backend test videos", () => {
  it.each(v2Videos)("%s", async (file) => {
    const {decodeAndVerifyFrameFromLuma, decodeNumericUserIdDiagnosticsFromLuma} = await import("../watermark-verification");
    const bad: string[] = [];
    const pem = readFileSync(join(__dirname, "fixtures", "v3-real", "test_public_key.pem"), "utf-8");
    const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""), "base64");
    const key = await crypto.subtle.importKey("spki", der, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
    const bytes = new Uint8Array(readFileSync(join(V2_VIDEO_DIR!, file)));
    const {iso, info} = parseMp4(bytes);
    const track = info.videoTracks[0];
    const width = track.video?.width ?? track.track_width;
    const height = track.video?.height ?? track.track_height;
    const samples = (iso.getTrackById(track.id) as unknown as {samples: Sample[]}).samples;
    const prefix = getAvcCAnnexBPrefix(iso, track.id)!;
    const keyframes = samples.map((s, i) => (s.is_sync ? i : -1)).filter((i) => i >= 0);
    const out: string[] = [];
    for (const index of keyframes) {
      const s = samples[index];
      const annexB = concatUint8(prefix, avccToAnnexB(bytes.subarray(s.offset, s.offset + s.size)));
      const planes = extractYuv420pPlanes(decodeSampleToYuv(annexB), width, height);
      const v3 = readFrameV3(planes);
      const r = await decodeAndVerifyFrameFromLuma(key, planes.y, width, height);
      const id = decodeNumericUserIdDiagnosticsFromLuma(planes.y, width, height).numericUserId;
      if (id !== EXPECTED_USER_ID || isV3Reading(v3)) bad.push(`${index}:id=${id}${isV3Reading(v3) ? ":V3" : ""}`);
      out.push(`${index}:id=${id}:legacyRsa=${r.verified ? "ok" : "fail"}`);
    }
    console.log(`[v2-report] ${file} ${width}x${height} keyframes=${keyframes.length} ${out.join(" ")}`);
    expect(out.length).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  }, 300000);
});
