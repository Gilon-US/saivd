import {publicVideoWatermarkedStreamUrl} from "@/lib/video-verification-url";

describe("publicVideoWatermarkedStreamUrl", () => {
  it("returns same-origin watermarked stream path", () => {
    expect(publicVideoWatermarkedStreamUrl("abc-123")).toBe(
      "/api/public/videos/abc-123/watermarked",
    );
  });
});
