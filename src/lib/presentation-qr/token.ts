import {createHmac, randomUUID, timingSafeEqual} from "crypto";
import {PRESENTATION_QR_TTL_SECONDS} from "./constants";

export type PresentationMediaKind = "video" | "image";

export type PresentationTokenPayload = {
  uid: number;
  kind: PresentationMediaKind;
  mid: string;
  iat: number;
  exp: number;
  jti: string;
};

export type MintPresentationTokenInput = {
  numericUserId: number;
  mediaKind: PresentationMediaKind;
  mediaId: string;
  ttlSeconds?: number;
};

function getSigningSecret(): string {
  const secret = process.env.PRESENTATION_QR_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("PRESENTATION_QR_SECRET is missing or too short");
  }
  return secret;
}

function signBody(body: string): string {
  return createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
}

export function mintPresentationToken(input: MintPresentationTokenInput): string {
  const ttl = input.ttlSeconds ?? PRESENTATION_QR_TTL_SECONDS;
  const now = Math.floor(Date.now() / 1000);
  const payload: PresentationTokenPayload = {
    uid: input.numericUserId,
    kind: input.mediaKind,
    mid: input.mediaId,
    iat: now,
    exp: now + ttl,
    jti: randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signBody(body)}`;
}

export type VerifyPresentationTokenResult =
  | {ok: true; payload: PresentationTokenPayload}
  | {ok: false; reason: "invalid" | "expired"};

export function verifyPresentationToken(token: string): VerifyPresentationTokenResult {
  const parts = token.split(".");
  if (parts.length !== 2) return {ok: false, reason: "invalid"};
  const [body, sig] = parts;
  if (!body || !sig) return {ok: false, reason: "invalid"};

  const expected = signBody(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return {ok: false, reason: "invalid"};
  }

  let payload: PresentationTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PresentationTokenPayload;
  } catch {
    return {ok: false, reason: "invalid"};
  }

  if (
    !Number.isFinite(payload.uid) ||
    (payload.kind !== "video" && payload.kind !== "image") ||
    typeof payload.mid !== "string" ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp)
  ) {
    return {ok: false, reason: "invalid"};
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return {ok: false, reason: "expired"};

  return {ok: true, payload};
}

export function buildScanUrl(token: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/scan?token=${encodeURIComponent(token)}`;
}
