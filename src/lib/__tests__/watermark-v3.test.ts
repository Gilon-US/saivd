import {webcrypto} from "crypto";
import {readFileSync} from "fs";
import {join} from "path";
import {TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder} from "util";
import {gunzipSync} from "zlib";

// jsdom (the project-wide test environment) lacks SubtleCrypto and may lack TextEncoder/TextDecoder.
const g = globalThis as unknown as {crypto?: Crypto; TextEncoder?: unknown; TextDecoder?: unknown};
if (!g.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {value: webcrypto, configurable: true});
}
if (typeof g.TextEncoder === "undefined") g.TextEncoder = NodeTextEncoder;
if (typeof g.TextDecoder === "undefined") g.TextDecoder = NodeTextDecoder;
import {
  bitsToSignature,
  crc16CcittFalse,
  decodeUserIdBlock,
  deinterleaveBits,
  interleaveBits,
  isV3Reading,
  readFrameV3,
  roundHalfEvenRatio,
  rsDecode,
  rsEncode,
  signatureToBits,
  userIdBlockBits,
  v3Layout,
  v3Message,
  verifyV3Signature,
  type YuvFrame,
} from "../watermark-v3";

type FixtureMeta = {
  width: number;
  height: number;
  userId: number;
  frameCount: number;
  message: string;
  signatureHex: string;
  publicKeyPem: string;
  layout: Record<string, number>;
};

const FIXTURE_DIR = join(__dirname, "fixtures", "v3");

function loadFixture(stem: string): {frame: YuvFrame; meta: FixtureMeta} {
  const meta = JSON.parse(readFileSync(join(FIXTURE_DIR, `${stem}.json`), "utf-8")) as FixtureMeta;
  const raw = new Uint8Array(gunzipSync(readFileSync(join(FIXTURE_DIR, `${stem}.yuv.gz`))));
  const ySize = meta.width * meta.height;
  const cSize = Math.ceil(meta.width / 2) * Math.ceil(meta.height / 2);
  return {
    meta,
    frame: {
      width: meta.width,
      height: meta.height,
      y: raw.slice(0, ySize),
      u: raw.slice(ySize, ySize + cSize),
      v: raw.slice(ySize + cSize, ySize + 2 * cSize),
    },
  };
}

async function importSpki(pem: string): Promise<CryptoKey> {
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""), "base64");
  return crypto.subtle.importKey("spki", der, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/** Deterministic PRNG so the error-injection tests are reproducible. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Flip the QIM bit of one 8x8 chroma patch by shifting all its pixels by +-4 (one quantization step). */
function flipChromaPatch(plane: Uint8Array, stride: number, row: number, col: number) {
  let sum = 0;
  for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) sum += plane[(row * 8 + dy) * stride + col * 8 + dx];
  const delta = sum / 64 > 128 ? -4 : 4;
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const i = (row * 8 + dy) * stride + col * 8 + dx;
      plane[i] = Math.max(0, Math.min(255, plane[i] + delta));
    }
  }
}

describe("v3Layout (guide §10 table)", () => {
  it.each([
    [854, 480, 30, 53, 50, 90, 1107, 7],
    [480, 854, 53, 30, 28, 106, 1099, 7],
    [1280, 720, 45, 80, 78, 90, 1107, 9],
    [720, 1280, 80, 45, 44, 80, 1112, 9],
    [1920, 1080, 67, 120, 118, 134, 1085, 9],
    [1080, 1920, 120, 67, 66, 120, 1092, 9],
    [3840, 2160, 135, 240, 239, 135, 1085, 9],
  ])("%ix%i", (w, h, rows, cols, payloadEnd, ySig, uvSig, copies) => {
    const layout = v3Layout(w, h);
    expect(layout).toMatchObject({
      rows,
      cols,
      payloadEnd,
      ySigCapacity: ySig,
      uvSigCapacity: uvSig,
      userIdCopiesPerPlane: copies,
      uvBits: uvSig + 64 * copies,
    });
  });

  it("returns null for frames too small for v3", () => {
    expect(v3Layout(640, 360)).toBeNull();
    expect(v3Layout(8, 8)).toBeNull();
  });
});

describe("roundHalfEvenRatio (np.round)", () => {
  it.each([
    [0, 4, 0],
    [1, 4, 0],
    [2, 4, 0], // 0.5 -> 0
    [3, 4, 1],
    [6, 4, 2], // 1.5 -> 2
    [10, 4, 2], // 2.5 -> 2
    [14, 4, 4], // 3.5 -> 4
    [512, 1024, 0],
    [1536, 1024, 2],
  ])("round(%i / %i) = %i", (sum, divisor, expected) => {
    expect(roundHalfEvenRatio(sum, divisor)).toBe(expected);
  });
});

describe("crc16CcittFalse", () => {
  it("matches the standard check value", () => {
    expect(crc16CcittFalse(new TextEncoder().encode("123456789"))).toBe(0x29b1);
  });
});

describe("Reed-Solomon RS(144,128)", () => {
  const rand = lcg(42);
  const data = Uint8Array.from({length: 128}, () => Math.floor(rand() * 256));
  const codeword = rsEncode(data);

  it("encodes systematically and decodes a clean codeword", () => {
    expect(codeword).toHaveLength(144);
    expect(Array.from(codeword.subarray(0, 128))).toEqual(Array.from(data));
    expect(rsDecode(codeword)).toEqual(data);
  });

  it.each([1, 4, 8])("corrects %i byte errors", (n) => {
    const r = lcg(n * 97);
    const corrupted = codeword.slice();
    const positions = new Set<number>();
    while (positions.size < n) positions.add(Math.floor(r() * 144));
    for (const p of positions) corrupted[p] ^= 1 + Math.floor(r() * 255);
    expect(rsDecode(corrupted)).toEqual(data);
  });

  it("does not recover the data from 9 byte errors", () => {
    const corrupted = codeword.slice();
    for (let p = 0; p < 9; p++) corrupted[p * 15] ^= 0x5a;
    const decoded = rsDecode(corrupted);
    expect(decoded === null || hex(decoded) !== hex(data)).toBe(true);
  });

  it("round-trips a signature through bits", () => {
    const sig = Uint8Array.from({length: 256}, (_, i) => (i * 37 + 11) & 0xff);
    const bits = signatureToBits(sig);
    expect(bits).toHaveLength(2304);
    expect(bitsToSignature(bits)).toEqual(sig);
  });
});

describe("interleave / deinterleave", () => {
  it.each([
    [[90, 1107, 1107]],
    [[134, 1085, 1085]],
    [[2304, 10, 10]],
  ])("round-trips with capacities %j", (capacities) => {
    const r = lcg(7);
    const bits = Uint8Array.from({length: 2304}, () => (r() < 0.5 ? 0 : 1));
    const planes = interleaveBits(bits, capacities);
    planes.forEach((p, i) => expect(p.length).toBeLessThanOrEqual(capacities[i]));
    expect(deinterleaveBits(planes, capacities)).toEqual(bits);
  });

  it("assigns bit 0 to Y, bit 1 to U, bit 2 to V", () => {
    const bits = Uint8Array.from({length: 2304}, (_, i) => (i < 3 ? [1, 0, 1][i] : 0));
    const [y, u, v] = interleaveBits(bits, [90, 1107, 1107]);
    expect([y[0], u[0], v[0]]).toEqual([1, 0, 1]);
  });
});

describe("user-ID block", () => {
  it("round-trips and survives minority corruption", () => {
    const block = userIdBlockBits(123456789);
    const copies = new Uint8Array(64 * 14);
    for (let c = 0; c < 14; c++) copies.set(block, c * 64);
    expect(decodeUserIdBlock(copies)).toBe(123456789);
    for (let c = 0; c < 6; c++) for (let b = 0; b < 64; b++) copies[c * 64 + b] ^= 1;
    expect(decodeUserIdBlock(copies)).toBe(123456789);
  });

  it("handles the 30-bit maximum and zero", () => {
    expect(decodeUserIdBlock(userIdBlockBits(2 ** 30 - 1))).toBe(2 ** 30 - 1);
    expect(decodeUserIdBlock(userIdBlockBits(0))).toBe(0);
  });

  it("rejects a bad CRC or marker", () => {
    const block = userIdBlockBits(42);
    block[63] ^= 1;
    expect(decodeUserIdBlock(block)).toBeNull();
    expect(decodeUserIdBlock(new Uint8Array(64))).toBeNull();
  });
});

describe("v3Message", () => {
  it("zero-pads the user id and writes the frame count in decimal", () => {
    expect(new TextDecoder().decode(v3Message(1234, 42))).toBe("saivd-v3:1234:000000042");
  });
});

describe.each(["frame-854x480", "frame-480x854"])("golden backend frame %s", (stem) => {
  const {frame, meta} = loadFixture(stem);

  it("matches the backend layout", () => {
    expect(v3Layout(meta.width, meta.height)).toMatchObject(meta.layout);
  });

  it("reads both user ids and the exact signature", () => {
    const reading = readFrameV3(frame);
    expect(isV3Reading(reading)).toBe(true);
    expect(reading?.userIdUv).toBe(meta.userId);
    expect(reading?.userIdY).toBe(meta.userId);
    expect(reading?.userId).toBe(meta.userId);
    expect(reading?.signature && hex(reading.signature)).toBe(meta.signatureHex);
    expect(new TextDecoder().decode(v3Message(meta.frameCount, meta.userId))).toBe(meta.message);
  });

  it("verifies only with the right frame count and user id", async () => {
    const key = await importSpki(meta.publicKeyPem);
    const signature = readFrameV3(frame)!.signature!;
    await expect(verifyV3Signature(key, signature, meta.frameCount, meta.userId)).resolves.toBe(true);
    await expect(verifyV3Signature(key, signature, meta.frameCount - 1, meta.userId)).resolves.toBe(false);
    await expect(verifyV3Signature(key, signature, meta.frameCount, meta.userId + 1)).resolves.toBe(false);
  });

  it("corrects a few damaged chroma patches", () => {
    const damaged = {...frame, u: frame.u.slice(), v: frame.v.slice()};
    const stride = Math.ceil(meta.width / 2);
    for (let i = 0; i < 6; i++) flipChromaPatch(damaged.u, stride, 1 + i * 2, 3 + i * 4);
    const reading = readFrameV3(damaged);
    expect(reading?.signature && hex(reading.signature)).toBe(meta.signatureHex);
    expect(reading?.userIdUv).toBe(meta.userId);
  });

  it("reports an unreadable signature when many patches are damaged", () => {
    const damaged = {...frame, u: frame.u.slice(), v: frame.v.slice()};
    const stride = Math.ceil(meta.width / 2);
    const cols = meta.layout.cols;
    const r = lcg(3);
    for (let i = 0; i < 400; i++) {
      const idx = Math.floor(r() * meta.layout.uvSigCapacity);
      flipChromaPatch(damaged.u, stride, Math.floor(idx / cols), idx % cols);
    }
    expect(readFrameV3(damaged)?.signature).toBeNull();
  });

  it("is not detected as v3 when the chroma planes carry no block", () => {
    const plain = {...frame, u: new Uint8Array(frame.u.length).fill(128), v: new Uint8Array(frame.v.length).fill(128)};
    const reading = readFrameV3(plain);
    expect(isV3Reading(reading)).toBe(false);
    expect(reading?.userIdY).toBe(meta.userId); // Y payload is v2-compatible
  });
});
