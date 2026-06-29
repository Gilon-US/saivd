import {
  getCreatorAppPublicOrigin,
  getPublicEmbedSnippet,
  getPublicEmbedUrl,
  getPublicWatchUrl,
  getViewerClaimUrl,
  getViewerOrigin,
} from "@/lib/public-media-urls";

describe("public-media-urls", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalViewerUrl = process.env.NEXT_PUBLIC_SAIVD_VIEWER_URL;

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }
    if (originalViewerUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SAIVD_VIEWER_URL;
    } else {
      process.env.NEXT_PUBLIC_SAIVD_VIEWER_URL = originalViewerUrl;
    }
  });

  it("uses creator env for public watch URLs", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://creator.saivd.io/";
    expect(getCreatorAppPublicOrigin()).toBe("https://creator.saivd.io");
    expect(getPublicWatchUrl("image", "abc")).toBe("https://creator.saivd.io/i/abc");
    expect(getPublicWatchUrl("video", "xyz")).toBe("https://creator.saivd.io/v/xyz");
  });

  it("falls back to browser origin when creator env is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getCreatorAppPublicOrigin()).toBe(window.location.origin);
  });

  it("builds creator embed URLs and snippets", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://creator.saivd.io";
    expect(getPublicEmbedUrl("video", "v1")).toBe("https://creator.saivd.io/embed/v1");
    expect(getPublicEmbedUrl("image", "i1")).toBe("https://creator.saivd.io/embed/i/i1");

    const videoSnippet = getPublicEmbedSnippet("video", "v1");
    expect(videoSnippet).toContain('src="https://creator.saivd.io/embed/v1"');

    const imageSnippet = getPublicEmbedSnippet("image", "i1");
    expect(imageSnippet).toContain('src="https://creator.saivd.io/embed/i/i1"');
  });

  it("keeps viewer origin for claim links", () => {
    process.env.NEXT_PUBLIC_SAIVD_VIEWER_URL = "https://viewer.example.com";
    expect(getViewerOrigin()).toBe("https://viewer.example.com");
    expect(getViewerClaimUrl("tok123")).toBe("https://viewer.example.com/claim/tok123");
  });
});
