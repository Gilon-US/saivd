import {buildScanUrl, mintPresentationToken, verifyPresentationToken} from "@/lib/presentation-qr/token";

describe("presentation QR token", () => {
  const originalSecret = process.env.PRESENTATION_QR_SECRET;

  beforeAll(() => {
    process.env.PRESENTATION_QR_SECRET = "test-secret-min-16-chars!!";
  });

  afterAll(() => {
    process.env.PRESENTATION_QR_SECRET = originalSecret;
  });

  it("mints and verifies a valid token", () => {
    const token = mintPresentationToken({
      numericUserId: 123456789,
      mediaKind: "image",
      mediaId: "img-uuid",
    });
    const result = verifyPresentationToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.uid).toBe(123456789);
      expect(result.payload.kind).toBe("image");
      expect(result.payload.mid).toBe("img-uuid");
    }
  });

  it("builds scan URLs with query token", () => {
    const token = mintPresentationToken({
      numericUserId: 1,
      mediaKind: "video",
      mediaId: "vid-1",
    });
    const url = buildScanUrl(token, "https://creator.example.com");
    expect(url.startsWith("https://creator.example.com/scan?token=")).toBe(true);
  });

  it("rejects tampered tokens", () => {
    const token = mintPresentationToken({
      numericUserId: 1,
      mediaKind: "video",
      mediaId: "vid-1",
    });
    const tampered = `${token}x`;
    expect(verifyPresentationToken(tampered).ok).toBe(false);
  });
});
