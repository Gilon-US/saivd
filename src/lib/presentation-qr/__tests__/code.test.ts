import {
  buildPresentationScanUrl,
  generatePresentationCode,
  isValidPresentationCode,
  PRESENTATION_CODE_LENGTH,
} from "@/lib/presentation-qr/code";
import {
  lookupPresentationCode,
  mintUniquePresentationCode,
  resetPresentationStoreForTests,
  savePresentationCodeIfAbsent,
} from "@/lib/presentation-qr/store";

describe("presentation QR short code", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    resetPresentationStoreForTests();
  });

  it("generates 8-char base62 codes", () => {
    const code = generatePresentationCode();
    expect(code).toHaveLength(PRESENTATION_CODE_LENGTH);
    expect(isValidPresentationCode(code)).toBe(true);
  });

  it("builds short scan URLs", () => {
    const url = buildPresentationScanUrl("Ab12Cd34", "https://creator.saivd.io");
    expect(url).toBe("https://creator.saivd.io/p/Ab12Cd34");
    expect(url.length).toBeLessThan(50);
  });

  it("stores and looks up codes in memory when REDIS_URL is unset", async () => {
    const code = await mintUniquePresentationCode(
      {uid: 123456, kind: "image", mid: "img-1"},
      240,
    );
    const record = await lookupPresentationCode(code);
    expect(record).toEqual({uid: 123456, kind: "image", mid: "img-1"});
  });

  it("rejects duplicate codes", async () => {
    const code = generatePresentationCode();
    const record = {uid: 1, kind: "video" as const, mid: "v1"};
    expect(await savePresentationCodeIfAbsent(code, record, 60)).toBe(true);
    expect(await savePresentationCodeIfAbsent(code, record, 60)).toBe(false);
  });
});
