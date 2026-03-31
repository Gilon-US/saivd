import {act, renderHook} from "@testing-library/react";
import {useWatermarkVerification} from "../useWatermarkVerification";

jest.mock("../../lib/wasm-watermark-verification-client", () => ({
  getFrameYFromWasm: jest.fn(),
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

import {
  ensureWasmVerificationSession,
  getFrameYFromWasm,
  prewarmWasmVerificationSession,
} from "../../lib/wasm-watermark-verification-client";
import {
  decodeNumericUserIdDiagnosticsFromLuma,
  fetchPublicKeyPem,
} from "../../lib/watermark-verification";

const mockedGetFrameYFromWasm = getFrameYFromWasm as jest.MockedFunction<typeof getFrameYFromWasm>;
const mockedEnsureWasmVerificationSession =
  ensureWasmVerificationSession as jest.MockedFunction<typeof ensureWasmVerificationSession>;
const mockedPrewarmWasmVerificationSession =
  prewarmWasmVerificationSession as jest.MockedFunction<typeof prewarmWasmVerificationSession>;
const mockedDecodeDiagnostics = decodeNumericUserIdDiagnosticsFromLuma as jest.MockedFunction<
  typeof decodeNumericUserIdDiagnosticsFromLuma
>;
const mockedFetchPublicKeyPem = fetchPublicKeyPem as jest.MockedFunction<typeof fetchPublicKeyPem>;

function mockFrameCaptureSuccess() {
  mockedGetFrameYFromWasm.mockResolvedValue({
    yPlane: new Uint8Array(16),
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
    });
    mockFrameCaptureSuccess();
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
