/**
 * Video playback flags for public /v pages (mirrors saivd-viewer; legacy defaults).
 */

export type PlaybackContext = "dashboard" | "public";

export type VideoElementPlaybackPlan = {
  src: string | undefined;
  preload: "auto" | "metadata" | "none";
  srcWithheld: boolean;
};

export function isSsrShellEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VIDEO_SSR_SHELL !== "0";
}

export function getPublicVideoShellPreload(): "auto" | "metadata" {
  return "auto";
}

export function isPrewarmEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VIDEO_PREWARM === "1";
}

export function getVideoElementPlaybackPlan(options: {
  videoUrl: string;
  context: PlaybackContext;
  contentLengthBytes?: number | null;
  verificationStatus: "verifying" | "verified" | "failed" | null | undefined;
  playRequested: boolean;
}): VideoElementPlaybackPlan {
  void options.context;
  void options.contentLengthBytes;
  void options.verificationStatus;
  void options.playRequested;
  return {src: options.videoUrl, preload: "auto", srcWithheld: false};
}
