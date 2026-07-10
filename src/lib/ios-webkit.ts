/**
 * iOS WebKit detection for image-verify workarounds only.
 * Mac Safari / desktop browsers must keep the existing canvas path.
 */
export function isIosWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS desktop-mode UA
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
}
