export type QrOverlayPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";

export const QR_OVERLAY_POSITIONS: QrOverlayPosition[] = [
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
];

export const DEFAULT_QR_OVERLAY_POSITION: QrOverlayPosition = "top-right";

export const QR_OVERLAY_POSITION_LABELS: Record<QrOverlayPosition, string> = {
  "top-right": "Top right",
  "top-left": "Top left",
  "bottom-right": "Bottom right",
  "bottom-left": "Bottom left",
};

const BASE_CLASSES: Record<QrOverlayPosition, string> = {
  "top-right": "top-2 right-2 sm:top-4 sm:right-4",
  "top-left": "top-2 left-2 sm:top-4 sm:left-4",
  "bottom-right": "bottom-2 right-2 sm:bottom-4 sm:right-4",
  "bottom-left": "bottom-2 left-2 sm:bottom-4 sm:left-4",
};

const ELEVATED_BOTTOM_CLASSES: Partial<Record<QrOverlayPosition, string>> = {
  "bottom-right": "bottom-16 right-2 sm:bottom-20 sm:right-4",
  "bottom-left": "bottom-16 left-2 sm:bottom-20 sm:left-4",
};

export function isQrOverlayPosition(value: unknown): value is QrOverlayPosition {
  return typeof value === "string" && (QR_OVERLAY_POSITIONS as string[]).includes(value);
}

export function parseQrOverlayPosition(value: unknown): QrOverlayPosition {
  return isQrOverlayPosition(value) ? value : DEFAULT_QR_OVERLAY_POSITION;
}

export function getQrOverlayPositionClasses(
  position: QrOverlayPosition,
  options?: {elevateAboveBottomControls?: boolean},
): string {
  if (options?.elevateAboveBottomControls && ELEVATED_BOTTOM_CLASSES[position]) {
    return ELEVATED_BOTTOM_CLASSES[position]!;
  }
  return BASE_CLASSES[position];
}
