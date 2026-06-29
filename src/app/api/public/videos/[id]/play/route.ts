import {NextRequest, NextResponse} from "next/server";
import {getPublicPlaybackData, type PlaybackVariant} from "@/lib/playback-url";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {status: 204, headers: {...CORS_HEADERS}});
}

/** GET /api/public/videos/[id]/play — public presigned URL for viewer /v and /embed pages. */
export async function GET(request: NextRequest, context: {params: Promise<{id: string}>}) {
  const {id: videoId} = await context.params;
  const {searchParams} = new URL(request.url);
  const variantParam = searchParams.get("variant") || "watermarked";
  const variant = variantParam as PlaybackVariant;

  const result = await getPublicPlaybackData(videoId, variant);

  if (!result.ok) {
    return NextResponse.json(
      {success: false, error: {code: result.code, message: result.message}},
      {status: result.status, headers: {...CORS_HEADERS}},
    );
  }

  return NextResponse.json(
    {success: true, data: {playbackUrl: result.playbackUrl}},
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        Vary: "Accept-Encoding",
      },
    },
  );
}
