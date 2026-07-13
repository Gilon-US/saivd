import {
  parseWatermarkProgress,
  resolveWatermarkProgress,
  isVideoWatermarking,
  isVideoNormalizing,
} from "@/lib/watermark-progress";

describe("parseWatermarkProgress", () => {
  it("parses segment fraction", () => {
    const p = parseWatermarkProgress("Encoding 3/9 segments");
    expect(p?.percent).toBe(33);
    expect(p?.phase).toBe("segments");
    expect(p?.label).toContain("3 of 9");
  });

  it("parses segment total only as 0% determinate", () => {
    const p = parseWatermarkProgress("Encoding 9 segments");
    expect(p?.percent).toBe(0);
    expect(p?.phase).toBe("segments");
    expect(p?.label).toContain("9 segments");
  });

  it("parses frame percent", () => {
    const p = parseWatermarkProgress("45.23%");
    expect(p?.percent).toBe(45);
    expect(p?.phase).toBe("percent");
  });

  it("parses mux phase", () => {
    const p = parseWatermarkProgress("Concatenating and muxing");
    expect(p?.percent).toBe(92);
    expect(p?.phase).toBe("mux");
  });

  it("parses normalize messages", () => {
    const p = parseWatermarkProgress("Normalizing");
    expect(p?.percent).toBeNull();
    expect(p?.phase).toBe("normalize");
  });
});

describe("resolveWatermarkProgress", () => {
  it("prefers structured segment counts", () => {
    const p = resolveWatermarkProgress("Encoding 9 segments", 3, 9);
    expect(p?.percent).toBe(33);
    expect(p?.label).toContain("3 of 9");
  });

  it("uses 0% when only total is known structurally", () => {
    const p = resolveWatermarkProgress("Encoding 0/9 segments", 0, 9);
    expect(p?.percent).toBe(0);
    expect(p?.label).toContain("Starting encode");
  });

  it("still parses mux from message when segments are complete", () => {
    const p = resolveWatermarkProgress("Concatenating and muxing", 9, 9);
    expect(p?.percent).toBe(92);
    expect(p?.phase).toBe("mux");
  });

  it("shows mux phase when all segments are done structurally", () => {
    const p = resolveWatermarkProgress("Encoding 22/22 segments", 22, 22);
    expect(p?.percent).toBe(92);
    expect(p?.phase).toBe("mux");
    expect(p?.label).toBe("Concatenating and muxing");
  });
});

describe("isVideoWatermarking", () => {
  it("true when processing", () => {
    expect(isVideoWatermarking({status: "processing"})).toBe(true);
  });

  it("false when failed pending job", () => {
    expect(isVideoWatermarking({status: "processing"}, {failed: true})).toBe(false);
  });
});

describe("isVideoNormalizing", () => {
  it("true when normalizing", () => {
    expect(isVideoNormalizing({normalization_status: "normalizing"})).toBe(true);
  });
});
