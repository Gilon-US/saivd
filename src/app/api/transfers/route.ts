import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {extractKeyFromUrl} from "@/lib/wasabi-urls";
import {generateTransferToken, hashTransferToken} from "@/lib/transfer-tokens";

/**
 * POST /api/transfers
 *
 * Creator-authenticated. Generates a one-time, 24h-expiry transfer token for
 * a single video the creator owns. Returns the plaintext token (only this
 * one time) plus a copyable share URL pointing at the viewer app.
 *
 * Request body:
 *   { video_id: string, viewer_origin?: string }
 *
 * `viewer_origin` is the base URL of the viewer app. Defaults to the
 * NEXT_PUBLIC_SAIVD_VIEWER_URL env var. The full share URL is
 * `${viewer_origin}/claim/${token}`.
 *
 * Response (201):
 *   {
 *     success: true,
 *     data: {
 *       token: string,            // plaintext, return ONCE
 *       share_url: string,        // viewer-origin + /claim/<token>
 *       expires_at: ISO timestamp
 *     }
 *   }
 */

const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {success: false, error: {code: "unauthorized", message: "Authentication required"}},
        {status: 401}
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {video_id?: unknown; viewer_origin?: unknown}
      | null;

    const videoId = typeof body?.video_id === "string" ? body.video_id : "";
    if (!videoId) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Missing video_id"}},
        {status: 400}
      );
    }

    // Verify the video belongs to this creator (RLS would also enforce, but
    // we want a clean 404 instead of a confusing insert-FK error).
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
        {status: 500}
      );
    }

    if (!video) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Video not found"}},
        {status: 404}
      );
    }

    // Resolve a storage key. We share whichever variant the viewer is meant to
    // play — for SAIVD that's the watermarked variant (processed_url) when it
    // exists, falling back to original_url for legacy rows. Same precedence
    // that the viewer's playback path uses.
    const storageRef = video.processed_url || video.original_url;
    if (!storageRef) {
      return NextResponse.json(
        {success: false, error: {code: "invalid_data", message: "Video has no storage reference"}},
        {status: 500}
      );
    }
    const storageKey = storageRef.startsWith("http") ? extractKeyFromUrl(storageRef) : storageRef;
    if (!storageKey) {
      return NextResponse.json(
        {success: false, error: {code: "invalid_data", message: "Could not resolve storage key"}},
        {status: 500}
      );
    }

    // Mint the token. Plaintext returns to caller; only the hash is stored.
    const token = generateTransferToken();
    const tokenHash = hashTransferToken(token);
    const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);

    const {error: insertError} = await supabase.from("transfers").insert({
      token_hash: tokenHash,
      video_id: video.id,
      filename: video.filename,
      filesize: video.filesize,
      content_type: video.content_type,
      storage_key: storageKey,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      // Token-hash collision is astronomically unlikely with 256 bits of
      // entropy, so any error here is a real DB problem.
      console.error("[transfers] insert failed", insertError);
      return NextResponse.json(
        {success: false, error: {code: "server_error", message: "Failed to create transfer"}},
        {status: 500}
      );
    }

    // Build the share URL. The viewer's origin is configurable so dev can
    // point at localhost.
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
      {status: 201}
    );
  } catch (err) {
    console.error("[transfers] unhandled error", err);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to create transfer"}},
      {status: 500}
    );
  }
}
