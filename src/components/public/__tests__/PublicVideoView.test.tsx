import {render, screen} from "@testing-library/react";
import {PublicVideoView} from "@/components/public/PublicVideoView";

jest.mock("@/hooks/useWatermarkVerification", () => ({
  useWatermarkVerification: jest.fn(() => ({
    status: "verified",
    verifiedUserId: "18",
  })),
}));

jest.mock("@/hooks/usePublicQrOverlayPosition", () => ({
  usePublicQrOverlayPosition: jest.fn(() => ({
    position: "top-right",
    logoUrl: null,
  })),
}));

jest.mock("@/components/presentation/PresentationQrFlipButton", () => ({
  PresentationQrFlipButton: () => <div data-testid="presentation-qr">QR</div>,
}));

jest.mock("@/lib/wasm-watermark-verification-client", () => ({
  prewarmWasmVerificationSession: jest.fn(),
}));

describe("PublicVideoView", () => {
  it("shows presentation QR after watermark verification", () => {
    render(
      <PublicVideoView
        videoId="9fc24c25-39b0-49e0-8f13-5ca9da6f0000"
        result={{ok: true, playbackUrl: "https://wasabi.example.com/video.mp4"}}
      />,
    );

    expect(screen.getByTestId("presentation-qr")).toBeInTheDocument();
    const video = document.querySelector("video");
    expect(video?.getAttribute("src")).toContain("/api/public/videos/");
  });

  it("does not show QR when verification has not succeeded", () => {
    const {useWatermarkVerification} = jest.requireMock("@/hooks/useWatermarkVerification");
    useWatermarkVerification.mockReturnValueOnce({
      status: "verifying",
      verifiedUserId: null,
    });

    render(
      <PublicVideoView
        videoId="9fc24c25-39b0-49e0-8f13-5ca9da6f0000"
        result={{ok: true, playbackUrl: "https://example.com/video.mp4"}}
      />,
    );

    expect(screen.queryByTestId("presentation-qr")).not.toBeInTheDocument();
    expect(screen.getByText(/Verifying/)).toBeInTheDocument();
  });
});
