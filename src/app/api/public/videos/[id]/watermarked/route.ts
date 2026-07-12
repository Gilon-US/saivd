import {NextRequest, NextResponse} from "next/server";
import {GetObjectCommand} from "@aws-sdk/client-s3";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {extractKeyFromUrl} from "@/lib/wasabi-urls";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {status: 204, headers: {...CORS_HEADERS}});
}

async function resolveWatermarkedKey(videoId: string): Promise<
  | {ok: true; key: string}
  | {ok: false; status: number; code: string; message: string}
> {
  const supabase = createServiceRoleClient();
  const {data: video, error} = await supabase
    .from("videos")
    .select("id, processed_url, original_url, status")
    .eq("id", videoId)
    .maybeSingle();

  if (error) {
    console.error("[public/videos/watermarked] Supabase error:", error);
    return {ok: false, status: 500, code: "server_error", message: "Failed to load video"};
  }

  if (!video) {
    return {ok: false, status: 404, code: "not_found", message: "Video not found"};
  }

  const watermarkedRef = video.processed_url || video.original_url;
  if (!watermarkedRef) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "Watermarked version not available for this video",
    };
  }

  const key = watermarkedRef.startsWith("http")
    ? extractKeyFromUrl(watermarkedRef)
    : watermarkedRef;

  if (!key) {
    return {
      ok: false,
      status: 500,
      code: "invalid_data",
      message: "Invalid watermarked storage key",
    };
  }

  return {ok: true, key};
}

/**
 * GET /api/public/videos/[id]/watermarked
 *
 * Same-origin proxy for watermarked MP4 bytes on public /v and /embed pages.
 * Supports HTTP Range (206) for WASM watermark verification.
 */
export async function GET(request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: videoId} = await context.params;
    const resolved = await resolveWatermarkedKey(videoId);
    if (!resolved.ok) {
      return NextResponse.json(
        {success: false, error: {code: resolved.code, message: resolved.message}},
        {status: resolved.status, headers: {...CORS_HEADERS}},
      );
    }

    const rangeHeader = request.headers.get("range") ?? undefined;
    const obj = await wasabiClient.send(
      new GetObjectCommand({
        Bucket: WASABI_BUCKET,
        Key: resolved.key,
        ...(rangeHeader ? {Range: rangeHeader} : {}),
      }),
    );

    const body = obj.Body;
    if (!body) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Video file not found in storage"}},
        {status: 404, headers: {...CORS_HEADERS}},
      );
    }

    const headers: Record<string, string> = {
      ...CORS_HEADERS,
      "Content-Type": obj.ContentType ?? "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=60",
    };

    if (obj.ContentLength != null) {
      headers["Content-Length"] = String(obj.ContentLength);
    }
    if (obj.ContentRange) {
      headers["Content-Range"] = obj.ContentRange;
    }
    if (obj.ETag) {
      headers.ETag = obj.ETag;
    }

    const status = rangeHeader && obj.ContentRange ? 206 : 200;

    return new NextResponse(body.transformToWebStream(), {status, headers});
  } catch (error) {
    console.error("[public/videos/watermarked] Error streaming video:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to load watermarked video"}},
      {status: 500, headers: {...CORS_HEADERS}},
    );
  }
}

export async function HEAD(request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: videoId} = await context.params;
    const resolved = await resolveWatermarkedKey(videoId);
    if (!resolved.ok) {
      return new NextResponse(null, {status: resolved.status, headers: {...CORS_HEADERS}});
    }

    const rangeHeader = request.headers.get("range") ?? undefined;
    const obj = await wasabiClient.send(
      new GetObjectCommand({
        Bucket: WASABI_BUCKET,
        Key: resolved.key,
        ...(rangeHeader ? {Range: rangeHeader} : {}),
      }),
    );

    const headers: Record<string, string> = {
      ...CORS_HEADERS,
      "Content-Type": obj.ContentType ?? "video/mp4",
      "Accept-Ranges": "bytes",
    };
    if (obj.ContentLength != null) {
      headers["Content-Length"] = String(obj.ContentLength);
    }
    if (obj.ContentRange) {
      headers["Content-Range"] = obj.ContentRange;
    }

    const status = rangeHeader && obj.ContentRange ? 206 : 200;
    return new NextResponse(null, {status, headers});
  } catch (error) {
    console.error("[public/videos/watermarked] HEAD error:", error);
    return new NextResponse(null, {status: 500, headers: {...CORS_HEADERS}});
  }
}
