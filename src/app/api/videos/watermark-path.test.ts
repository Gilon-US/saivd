import {normalizeWatermarkPath} from "./[id]/watermark/route";

describe("normalizeWatermarkPath", () => {
  it("returns key portion for s3 path with bucket", () => {
    const input = "s3://saivd-app/output_with_edits_test2.mp4";
    expect(normalizeWatermarkPath(input)).toBe("output_with_edits_test2.mp4");
  });

  it("returns key portion for nested s3 key", () => {
    const input = "s3://my-bucket/folder/sub/video.mp4";
    expect(normalizeWatermarkPath(input)).toBe("folder/sub/video.mp4");
  });

  it("returns original string when not an s3 URL", () => {
    const input = "/plain/path/video.mp4";
    expect(normalizeWatermarkPath(input)).toBe(input);
  });
});
