import {webcrypto} from "crypto";
import {readFileSync} from "fs";
import {join} from "path";
import {TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder} from "util";
import {gunzipSync} from "zlib";
import {isV3Reading, readFrameV3, v3Layout, v3Message, verifyV3Signature} from "../watermark-v3";

/**
 * Real decoded keyframes from a backend v3 output (saivd-backend B6:
 * tests/fixtures/v3_viewer, from video_examples/v3_test/landscape_854x480_v3_watermark.mp4).
 * Unlike the synthetic golden frames, these went through H.264 encode + decode.
 */

const g = globalThis as unknown as {crypto?: Crypto; TextEncoder?: unknown; TextDecoder?: unknown};
if (!g.crypto?.subtle) Object.defineProperty(globalThis, "crypto", {value: webcrypto, configurable: true});
if (typeof g.TextEncoder === "undefined") g.TextEncoder = NodeTextEncoder;
if (typeof g.TextDecoder === "undefined") g.TextDecoder = NodeTextDecoder;

type Expected = {
  width: number;
  height: number;
  frame_count: number;
  user_id: number;
  layout: {rows: number; cols: number; payload_end: number; y_sig_capacity: number; uv_sig_capacity: number; user_id_copies_per_plane: number; uv_bits: number};
  frames: Array<{
    file: string;
    frame_index: number;
    expected: {
      user_id_y: number;
      user_id_uv: number;
      rs_codewords_before_correction_hex: string;
      signature_hex: string;
      signed_message: string;
      verify: boolean;
    };
  }>;
};

const DIR = join(__dirname, "fixtures", "v3-real");
const expected = JSON.parse(readFileSync(join(DIR, "expected.json"), "utf-8")) as Expected;
const pem = readFileSync(join(DIR, "test_public_key.pem"), "utf-8");

function loadFrame(file: string) {
  const raw = new Uint8Array(gunzipSync(readFileSync(join(DIR, `${file}.gz`))));
  const {width, height} = expected;
  const ySize = width * height;
  const cSize = Math.ceil(width / 2) * Math.ceil(height / 2);
  expect(raw.length).toBe(ySize + 2 * cSize);
  return {
    width,
    height,
    y: raw.subarray(0, ySize),
    u: raw.subarray(ySize, ySize + cSize),
    v: raw.subarray(ySize + cSize),
  };
}

async function publicKey(): Promise<CryptoKey> {
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""), "base64");
  return crypto.subtle.importKey("spki", der, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("v3 reader on real backend keyframes (B6)", () => {
  it("matches the backend layout", () => {
    const l = expected.layout;
    expect(v3Layout(expected.width, expected.height)).toMatchObject({
      rows: l.rows,
      cols: l.cols,
      payloadEnd: l.payload_end,
      ySigCapacity: l.y_sig_capacity,
      uvSigCapacity: l.uv_sig_capacity,
      userIdCopiesPerPlane: l.user_id_copies_per_plane,
      uvBits: l.uv_bits,
    });
  });

  it.each(expected.frames.map((f) => [f.frame_index, f] as const))("keyframe %i", async (_index, frame) => {
    const reading = readFrameV3(loadFrame(frame.file));
    expect(isV3Reading(reading)).toBe(true);
    expect(reading?.userIdY).toBe(frame.expected.user_id_y);
    expect(reading?.userIdUv).toBe(frame.expected.user_id_uv);
    expect(hex(reading!.codewords)).toBe(frame.expected.rs_codewords_before_correction_hex);
    expect(reading?.signature && hex(reading.signature)).toBe(frame.expected.signature_hex);
    expect(new TextDecoder().decode(v3Message(expected.frame_count, expected.user_id))).toBe(
      frame.expected.signed_message
    );
    const key = await publicKey();
    await expect(
      verifyV3Signature(key, reading!.signature!, expected.frame_count, reading!.userId!)
    ).resolves.toBe(frame.expected.verify);
    // a cut video (one frame fewer) must not verify
    await expect(
      verifyV3Signature(key, reading!.signature!, expected.frame_count - 1, reading!.userId!)
    ).resolves.toBe(false);
  });
});
