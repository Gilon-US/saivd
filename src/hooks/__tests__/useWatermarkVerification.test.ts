import {act, renderHook} from "@testing-library/react";
import {useWatermarkVerification} from "../useWatermarkVerification";

jest.mock("../../lib/wasm-watermark-verification-client", () => ({
  getFrameYFromWasm: jest.fn(),
  getFrameYuvFromWasm: jest.fn(),
  getWasmVideoTrackInfo: jest.fn(),
  ensureWasmVerificationSession: jest.fn(),
  disposeWasmVerificationSession: jest.fn(),
  prewarmWasmVerificationSession: jest.fn(),
  scheduleDisposeWasmVerificationSession: jest.fn(),
}));

jest.mock("../../lib/watermark-verification", () => ({
  decodeNumericUserIdDiagnosticsFromLuma: jest.fn(),
  decodeAndVerifyFrameFromLuma: jest.fn(),
  fetchPublicKeyPem: jest.fn(),
  importPublicKeyFromPem: jest.fn(),
}));

jest.mock("../../lib/watermark-v3", () => ({
  readFrameV3: jest.fn(),
  isV3Reading: (r: {userIdUv: number | null} | null) => r !== null && r.userIdUv !== null,
  verifyV3Signature: jest.fn(),
}));

import {
  ensureWasmVerificationSession,
  getFrameYuvFromWasm,
  prewarmWasmVerificationSession,
} from "../../lib/wasm-watermark-verification-client";
import {
  decodeNumericUserIdDiagnosticsFromLuma,
  fetchPublicKeyPem,
  importPublicKeyFromPem,
} from "../../lib/watermark-verification";
import {readFrameV3, verifyV3Signature} from "../../lib/watermark-v3";

const mockedGetFrameYuvFromWasm = getFrameYuvFromWasm as jest.MockedFunction<typeof getFrameYuvFromWasm>;
const mockedReadFrameV3 = readFrameV3 as jest.MockedFunction<typeof readFrameV3>;
const mockedVerifyV3Signature = verifyV3Signature as jest.MockedFunction<typeof verifyV3Signature>;
const mockedImportPublicKeyFromPem = importPublicKeyFromPem as jest.MockedFunction<typeof importPublicKeyFromPem>;
const mockedEnsureWasmVerificationSession =
  ensureWasmVerificationSession as jest.MockedFunction<typeof ensureWasmVerificationSession>;
const mockedPrewarmWasmVerificationSession =
  prewarmWasmVerificationSession as jest.MockedFunction<typeof prewarmWasmVerificationSession>;
const mockedDecodeDiagnostics = decodeNumericUserIdDiagnosticsFromLuma as jest.MockedFunction<
  typeof decodeNumericUserIdDiagnosticsFromLuma
>;
const mockedFetchPublicKeyPem = fetchPublicKeyPem as jest.MockedFunction<typeof fetchPublicKeyPem>;

function mockFrameCaptureSuccess() {
  mockedGetFrameYuvFromWasm.mockResolvedValue({
    y: new Uint8Array(16),
    u: new Uint8Array(4),
    v: new Uint8Array(4),
    width: 4,
    height: 4,
  });
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useWatermarkVerification bootstrap 3-frame consensus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrewarmWasmVerificationSession.mockResolvedValue();
    mockedEnsureWasmVerificationSession.mockResolvedValue({
      nbSamples: 100,
      width: 4,
      height: 4,
      keyframes: [{index: 0, time: 0}],
    });
    mockFrameCaptureSuccess();
    mockedReadFrameV3.mockReturnValue(null); // not a v3 frame: the v2 path runs
    mockedFetchPublicKeyPem.mockRejectedValue(new Error("network"));
  });

  it("verifies when at least two frames vote same numericUserId", async () => {
    mockedDecodeDiagnostics
      .mockReturnValueOnce({
        numericUserId: 123456789,
        bestScore: 3,
        bestShift: 0,
        repsUsed: 4,
        rightSideLength: 60,
        validDigits: true,
      })
      .mockReturnValueOnce({
        numericUserId: 123456789,
        bestScore: 1,
        bestShift: 0,
        repsUsed: 4,
        rightSideLength: 60,
        validDigits: true,
      })
      .mockReturnValueOnce({
        numericUserId: 987654321,
        bestScore: 0,
        bestShift: 0,
        repsUsed: 4,
        rightSideLength: 60,
        validDigits: true,
      });

    const onVerificationComplete = jest.fn();
    const videoRef = {current: null} as React.RefObject<HTMLVideoElement | null>;
    const {result} = renderHook(() =>
      useWatermarkVerification(videoRef, "https://example.com/video.mp4", {
        enabled: true,
        onVerificationComplete,
      })
    );

    await flushAsync();

    expect(result.current.status).toBe("verified");
    expect(result.current.verifiedUserId).toBe("123456789");
    expect(onVerificationComplete).toHaveBeenCalledWith("verified", "123456789");
  });

  it("verifies single-vote winner only when strong confidence threshold is met", async () => {
    mockedDecodeDiagnostics
      .mockReturnValueOnce({
        numericUserId: 111111111,
        bestScore: 2,
        bestShift: 0,
        repsUsed: 4,
        rightSideLength: 60,
        validDigits: true,
      })
      .mockReturnValueOnce({
        numericUserId: 222222222,
        bestScore: 0,
        bestShift: 0,
        repsUsed: 4,
        rightSideLength: 60,
        validDigits: true,
      })
      .mockReturnValueOnce({
        numericUserId: 333333333,
        bestScore: 4,
        bestShift: 0,
        repsUsed: 4,
        rightSideLength: 60,
        validDigits: true,
      });

    const onVerificationComplete = jest.fn();
    const videoRef = {current: null} as React.RefObject<HTMLVideoElement | null>;
    const {result} = renderHook(() =>
      useWatermarkVerification(videoRef, "https://example.com/video.mp4", {
        enabled: true,
        onVerificationComplete,
      })
    );

    await flushAsync();

    expect(result.current.status).toBe("verified");
    expect(result.current.verifiedUserId).toBe("222222222");
    expect(onVerificationComplete).toHaveBeenCalledWith("verified", "222222222");
  });

  it("fails when no consensus and no strong single-frame candidate", async () => {
    mockedDecodeDiagnostics
      .mockReturnValueOnce({
        numericUserId: 444444444,
        bestScore: 1,
        bestShift: 0,
        repsUsed: 4,
        rightSideLength: 60,
        validDigits: true,
      })
      .mockReturnValueOnce({
        numericUserId: null,
        bestScore: Number.POSITIVE_INFINITY,
        bestShift: 0,
        repsUsed: 0,
        rightSideLength: 0,
        validDigits: false,
      })
      .mockReturnValueOnce({
        numericUserId: null,
        bestScore: Number.POSITIVE_INFINITY,
        bestShift: 0,
        repsUsed: 0,
        rightSideLength: 0,
        validDigits: false,
      });

    const onVerificationComplete = jest.fn();
    const videoRef = {current: null} as React.RefObject<HTMLVideoElement | null>;
    const {result} = renderHook(() =>
      useWatermarkVerification(videoRef, "https://example.com/video.mp4", {
        enabled: true,
        onVerificationComplete,
      })
    );

    await flushAsync();

    expect(result.current.status).toBe("failed");
    expect(result.current.verifiedUserId).toBeNull();
    expect(onVerificationComplete).toHaveBeenCalledWith("failed", null);
  });
});

describe("useWatermarkVerification v3 bootstrap", () => {
  const v3Reading = {
    layout: {} as never,
    userId: 123456789,
    userIdY: 123456789,
    userIdUv: 123456789,
    signature: new Uint8Array(256),
    codewords: new Uint8Array(288),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrewarmWasmVerificationSession.mockResolvedValue();
    mockedEnsureWasmVerificationSession.mockResolvedValue({
      nbSamples: 151,
      width: 854,
      height: 480,
      keyframes: [{index: 0, time: 0}],
    });
    mockFrameCaptureSuccess();
    mockedFetchPublicKeyPem.mockResolvedValue("-----BEGIN PUBLIC KEY-----\nx\n-----END PUBLIC KEY-----");
    mockedImportPublicKeyFromPem.mockResolvedValue({} as CryptoKey);
  });

  it("uses the U/V user id, reports v3, and signs over the sample count", async () => {
    mockedReadFrameV3.mockReturnValue(v3Reading);
    mockedVerifyV3Signature.mockResolvedValue(true);
    const onVerificationComplete = jest.fn();
    const videoRef = {current: null} as React.RefObject<HTMLVideoElement | null>;
    const {result} = renderHook(() =>
      useWatermarkVerification(videoRef, "https://example.com/v3.mp4", {enabled: true, onVerificationComplete})
    );

    await flushAsync();
    await flushAsync();

    expect(result.current.status).toBe("verified");
    expect(result.current.watermarkFormat).toBe("v3");
    expect(result.current.verifiedUserId).toBe("123456789");
    expect(onVerificationComplete).toHaveBeenCalledWith("verified", "123456789");
    expect(mockedVerifyV3Signature).toHaveBeenCalledWith(expect.anything(), v3Reading.signature, 151, 123456789);
    expect(mockedDecodeDiagnostics).not.toHaveBeenCalled();
  });

  it("ignores a failing bootstrap-frame signature (informational only)", async () => {
    mockedReadFrameV3.mockReturnValue(v3Reading);
    mockedVerifyV3Signature.mockResolvedValue(false);
    const videoRef = {current: null} as React.RefObject<HTMLVideoElement | null>;
    const {result} = renderHook(() =>
      useWatermarkVerification(videoRef, "https://example.com/v3b.mp4", {enabled: true})
    );

    await flushAsync();
    await flushAsync();

    expect(result.current.status).toBe("verified");
    expect(result.current.watermarkFormat).toBe("v3");
  });
});
