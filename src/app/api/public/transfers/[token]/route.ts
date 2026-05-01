import {NextRequest, NextResponse} from "next/server";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {generatePresignedVideoUrl} from "@/lib/wasabi-urls";
import {hashTransferToken, isPlausibleTransferToken} from "@/lib/transfer-tokens";

/**
 * GET /api/public/transfers/[token]
 *
 * Public, no auth — the token IS the auth. Used by the viewer app to fetch
 * the metadata + a fresh download URL for a single transferred video.
 *
 * On every successful read we mint a new 1-hour presigned download URL from
 * the stored Wasabi key. That way leaked URLs have a narrow window even if
 * the transfer itself is valid for 24 hours.
 *
 * Failure modes (invalid shape, not found, expired, already claimed) all
 * return identical 404 bodies so the endpoint can't be probed for state.
 *
 * Response (200):
 *   {
 *     success: true,
 *     data: {
 *       file: { filename, size, content_type, download_url },
 *       expires_at: ISO timestamp
 *     }
 *   }
 *
 * Response (404):
 *   { success: false, error: { code: "not_found", message: "Transfer not found" } }
 */

const PRESIGN_TTL_SECONDS = 60 * 60; // 1 hour — independent of the 24h transfer TTL

const NOT_FOUND_RESPONSE = {
  success: false,
  error: {code: "not_found", message: "Transfer not found"},
} as const;

export async function GET(_request: NextRequest, context: {params: Promise<{token: string}>}) {
  try {
    const {token} = await context.params;

    if (!isPlausibleTransferToken(token)) {
      return NextResponse.json(NOT_FOUND_RESPONSE, {status: 404});
    }

    const tokenHash = hashTransferToken(token);
    const supabase = createServiceRoleClient();

    const {data: transfer, error} = await supabase
      .from("transfers")
      .select("filename, filesize, content_type, storage_key, expires_at, claimed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      console.error("[transfers/public] lookup failed", error);
      // Treat DB errors as 404 to the caller so we don't leak server-state
      // signals; the real error is in our logs.
      return NextResponse.json(NOT_FOUND_RESPONSE, {status: 404});
    }

    if (!transfer) {
      return NextResponse.json(NOT_FOUND_RESPONSE, {status: 404});
    }

    if (transfer.claimed_at) {
      return NextResponse.json(NOT_FOUND_RESPONSE, {status: 404});
    }

    if (new Date(transfer.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(NOT_FOUND_RESPONSE, {status: 404});
    }

    let downloadUrl: string;
    try {
      downloadUrl = await generatePresignedVideoUrl(transfer.storage_key, PRESIGN_TTL_SECONDS);
    } catch (signError) {
      console.error("[transfers/public] presign failed", signError);
      return NextResponse.json(
        {success: false, error: {code: "server_error", message: "Failed to prepare download"}},
        {status: 500}
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        file: {
          filename: transfer.filename,
          size: transfer.filesize,
          content_type: transfer.content_type,
          download_url: downloadUrl,
        },
        expires_at: transfer.expires_at,
      },
    });
  } catch (err) {
    console.error("[transfers/public] unhandled error", err);
    return NextResponse.json(NOT_FOUND_RESPONSE, {status: 404});
  }
}
