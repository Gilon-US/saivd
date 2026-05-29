import {randomBytes} from "crypto";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const PRESENTATION_CODE_LENGTH = 8;

export const PRESENTATION_CODE_PATTERN = /^[0-9A-Za-z]{8}$/;

/** Short opaque code for scannable presentation QR URLs (/p/{code}). */
export function generatePresentationCode(length = PRESENTATION_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += BASE62[bytes[i]! % BASE62.length];
  }
  return code;
}

export function isValidPresentationCode(code: string): boolean {
  return PRESENTATION_CODE_PATTERN.test(code);
}

export function buildPresentationScanUrl(code: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/p/${code}`;
}
