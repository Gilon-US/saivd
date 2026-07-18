import {
  displayAspectFromTrack,
  isMp4BoxFriendlyFile,
  watermarkedPlaybackScaleX,
} from "@/lib/video-display-aspect";

describe("video-display-aspect", () => {
  it("computes portrait display aspect from SAR", () => {
    const aspect = displayAspectFromTrack(1076, 1080, "9:16");
    expect(aspect).toBeCloseTo(269 / 480, 4);
  });

  it("defaults SAR to 1:1 when missing", () => {
    const aspect = displayAspectFromTrack(3840, 2160, null);
    expect(aspect).toBeCloseTo(16 / 9, 4);
  });

  it("applies horizontal scale for watermarked portrait without SAR metadata", () => {
    const scale = watermarkedPlaybackScaleX(1076, 1080, 269 / 480);
    expect(scale).toBeCloseTo(0.562, 2);
  });

  it("skips scale correction for landscape sources", () => {
    const scale = watermarkedPlaybackScaleX(3840, 2160, 16 / 9);
    expect(scale).toBe(1);
  });

  it("treats QuickTime .mov as non-mp4box-friendly", () => {
    const mov = new File(["x"], "clip.mov", {type: "video/quicktime"});
    const mp4 = new File(["x"], "clip.mp4", {type: "video/mp4"});
    expect(isMp4BoxFriendlyFile(mov)).toBe(false);
    expect(isMp4BoxFriendlyFile(mp4)).toBe(true);
  });
});
