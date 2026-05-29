import {NextRequest, NextResponse} from "next/server";
import {getCreatorAppBaseUrl, isPresentationQrEnabled, PRESENTATION_QR_TTL_SECONDS} from "@/lib/presentation-qr/constants";
import {buildScanUrl, mintPresentationToken, type PresentationMediaKind} from "@/lib/presentation-qr/token";

const rateBucket = new Map<string, {count: number; resetAt: number}>();
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateBucket.get(key);
  if (!entry || now >= entry.resetAt) {
    rateBucket.set(key, {count: 1, resetAt: now + RATE_WINDOW_MS});
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  if (!isPresentationQrEnabled()) {
    return NextResponse.json(
      {success: false, error: {code: "disabled", message: "Presentation QR is disabled"}},
      {status: 404},
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      {success: false, error: {code: "rate_limited", message: "Too many requests"}},
      {status: 429},
    );
  }

  try {
    const body = await request.json();
    const numericUserId = Number(body?.numericUserId);
    const mediaKind = body?.mediaKind as PresentationMediaKind;
    const mediaId = typeof body?.mediaId === "string" ? body.mediaId.trim() : "";

    if (!Number.isInteger(numericUserId) || numericUserId <= 0 || numericUserId > 999_999_999) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Invalid numericUserId"}},
        {status: 400},
      );
    }
    if (mediaKind !== "video" && mediaKind !== "image") {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Invalid mediaKind"}},
        {status: 400},
      );
    }
    if (!mediaId) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "mediaId is required"}},
        {status: 400},
      );
    }

    const token = mintPresentationToken({numericUserId, mediaKind, mediaId});
    const baseUrl = getCreatorAppBaseUrl();
    const scanUrl = buildScanUrl(token, baseUrl);
    const expiresAt = new Date(Date.now() + PRESENTATION_QR_TTL_SECONDS * 1000).toISOString();

    return NextResponse.json({
      success: true,
      data: {scanUrl, expiresAt},
    });
  } catch (error) {
    console.error("[presentation/mint] error:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to mint presentation token"}},
      {status: 500},
    );
  }
}
