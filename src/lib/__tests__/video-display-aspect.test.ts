import {
  displayAspectFromTrack,
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
});
