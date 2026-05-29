import {
  DEFAULT_QR_OVERLAY_POSITION,
  getQrOverlayPositionClasses,
  isQrOverlayPosition,
  parseQrOverlayPosition,
} from "../position";

describe("presentation-qr position", () => {
  it("validates known positions", () => {
    expect(isQrOverlayPosition("top-right")).toBe(true);
    expect(isQrOverlayPosition("bottom-left")).toBe(true);
    expect(isQrOverlayPosition("center")).toBe(false);
  });

  it("falls back to default for invalid values", () => {
    expect(parseQrOverlayPosition(undefined)).toBe(DEFAULT_QR_OVERLAY_POSITION);
    expect(parseQrOverlayPosition("invalid")).toBe(DEFAULT_QR_OVERLAY_POSITION);
  });

  it("elevates bottom corners above video controls", () => {
    expect(getQrOverlayPositionClasses("bottom-right", {elevateAboveBottomControls: true})).toContain(
      "bottom-16",
    );
    expect(getQrOverlayPositionClasses("top-right", {elevateAboveBottomControls: true})).toContain(
      "top-2",
    );
  });
});
