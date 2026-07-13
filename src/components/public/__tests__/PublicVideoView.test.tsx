import {render, screen} from "@testing-library/react";
import {PublicVideoView} from "@/app/v/[id]/_view";

jest.mock("@/components/video/VideoPlayer", () => ({
  VideoPlayer: ({
    videoUrl,
    verificationStatus,
  }: {
    videoUrl: string;
    verificationStatus: string | null;
  }) => (
    <div data-testid="video-player" data-url={videoUrl} data-status={verificationStatus ?? ""} />
  ),
}));

jest.mock("@/lib/wasm-watermark-verification-client", () => ({
  prewarmWasmVerificationSession: jest.fn(),
}));

describe("PublicVideoView", () => {
  it("opens VideoPlayer with presigned playback URL from server prefetch", () => {
    render(
      <PublicVideoView
        videoId="9fc24c25-39b0-49e0-8f13-5ca9da6f0000"
        initialPlaybackUrl="https://wasabi.example.com/video.mp4"
        initialError={null}
      />,
    );

    const player = screen.getByTestId("video-player");
    expect(player).toHaveAttribute("data-url", "https://wasabi.example.com/video.mp4");
    expect(player).toHaveAttribute("data-status", "verifying");
  });

  it("shows not found when server prefetch returned 404", () => {
    render(
      <PublicVideoView
        videoId="9fc24c25-39b0-49e0-8f13-5ca9da6f0000"
        initialPlaybackUrl={null}
        initialError={{code: "not_found", message: "Video not found", status: 404}}
      />,
    );

    expect(screen.getByText(/Video not found/i)).toBeInTheDocument();
    expect(screen.queryByTestId("video-player")).not.toBeInTheDocument();
  });
});
