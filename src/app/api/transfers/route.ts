import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {extractKeyFromUrl} from "@/lib/wasabi-urls";
import {generateTransferToken, hashTransferToken} from "@/lib/transfer-tokens";

/**
 * POST /api/transfers
 *
 * Creator-authenticated. Generates a one-time, 24h-expiry transfer token for
 * a single video or image the creator owns.
 */

const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function resolveStorageKey(storageRef: string | null): string | null {
  if (!storageRef) return null;
  if (storageRef.startsWith("http")) {
    return extractKeyFromUrl(storageRef);
  }
  return storageRef;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {success: false, error: {code: "unauthorized", message: "Authentication required"}},
        {status: 401},
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {video_id?: unknown; image_id?: unknown; viewer_origin?: unknown}
      | null;

    const videoId = typeof body?.video_id === "string" ? body.video_id.trim() : "";
    const imageId = typeof body?.image_id === "string" ? body.image_id.trim() : "";

    if (Boolean(videoId) === Boolean(imageId)) {
      return NextResponse.json(
        {
          success: false,
          error: {code: "validation_error", message: "Provide exactly one of video_id or image_id"},
        },
        {status: 400},
      );
    }

    let filename = "";
    let filesize = 0;
    let contentType = "application/octet-stream";
    let storageKey: string | null = null;
    let insertRow: Record<string, unknown>;

    if (videoId) {
      const {data: video, error: videoError} = await supabase
        .from("videos")
        .select("id, filename, filesize, content_type, original_url, processed_url, status")
        .eq("id", videoId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (videoError) {
        console.error("[transfers] error loading video", videoError);
        return NextResponse.json(
          {success: false, error: {code: "server_error", message: "Failed to load video"}},
          {status: 500},
        );
      }

      if (!video) {
        return NextResponse.json(
          {success: false, error: {code: "not_found", message: "Video not found"}},
          {status: 404},
        );
      }

      const storageRef = video.processed_url || video.original_url;
      storageKey = resolveStorageKey(storageRef);
      if (!storageKey) {
        return NextResponse.json(
          {success: false, error: {code: "invalid_data", message: "Video has no storage reference"}},
          {status: 500},
        );
      }

      filename = video.filename;
      filesize = video.filesize ?? 0;
      contentType = video.content_type ?? "video/mp4";
      insertRow = {video_id: video.id};
    } else {
      const {data: image, error: imageError} = await supabase
        .from("images")
        .select("id, filename, file_size, content_type, original_url, processed_url, status")
        .eq("id", imageId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (imageError) {
        console.error("[transfers] error loading image", imageError);
        return NextResponse.json(
          {success: false, error: {code: "server_error", message: "Failed to load image"}},
          {status: 500},
        );
      }

      if (!image) {
        return NextResponse.json(
          {success: false, error: {code: "not_found", message: "Image not found"}},
          {status: 404},
        );
      }

      const storageRef =
        image.status === "processed" && image.processed_url ? image.processed_url : image.original_url;
      storageKey = resolveStorageKey(storageRef);
      if (!storageKey) {
        return NextResponse.json(
          {success: false, error: {code: "invalid_data", message: "Image has no storage reference"}},
          {status: 500},
        );
      }

      filename = image.filename;
      filesize = image.file_size ?? 0;
      contentType = image.content_type ?? "image/png";
      insertRow = {image_id: image.id};
    }

    const token = generateTransferToken();
    const tokenHash = hashTransferToken(token);
    const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);

    const {error: insertError} = await supabase.from("transfers").insert({
      ...insertRow,
      token_hash: tokenHash,
      filename,
      filesize,
      content_type: contentType,
      storage_key: storageKey,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("[transfers] insert failed", insertError);
      return NextResponse.json(
        {success: false, error: {code: "server_error", message: "Failed to create transfer"}},
        {status: 500},
      );
    }

    const viewerOriginRaw =
      (typeof body?.viewer_origin === "string" && body.viewer_origin) ||
      process.env.NEXT_PUBLIC_SAIVD_VIEWER_URL ||
      "https://viewer.saivd.io";
    const viewerOrigin = viewerOriginRaw.replace(/\/+$/, "");
    const shareUrl = `${viewerOrigin}/claim/${token}`;

    return NextResponse.json(
      {
        success: true,
        data: {
          token,
          share_url: shareUrl,
          expires_at: expiresAt.toISOString(),
        },
      },
      {status: 201},
    );
  } catch (err) {
    console.error("[transfers] unhandled error", err);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to create transfer"}},
      {status: 500},
    );
  }
}
