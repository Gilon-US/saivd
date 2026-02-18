import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {DeleteObjectCommand} from "@aws-sdk/client-s3";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";
import {extractKeyFromUrl} from "@/lib/wasabi-urls";
import {clearWatermarkQueueJobsForVideo} from "@/lib/watermark-queue";

/**
 * DELETE /api/videos/[id]/watermarked
 *
 * Deletes the watermarked (processed) video file and any dedicated processed
 * thumbnail from Wasabi/S3, and clears all related fields in the database so
 * the video is back to "uploaded" state. Re-watermarking will perform a full
 * job (no use of cached or existing DB data for the watermarked asset).
 *
 * - Deletes the processed video file from Wasabi (key from processed_url).
 * - If processed_thumbnail_url points to a different object than the original
 *   thumbnail, deletes that object from Wasabi.
 * - Sets processed_url, processed_thumbnail_url to null and status to "uploaded".
 * - Clears queue jobs for this video.
 */
export async function DELETE(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: videoId} = await context.params;

    // Get authenticated user
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

    // Get video details
    const {data: video, error: fetchError} = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !video) {
      return NextResponse.json({success: false, error: {code: "not_found", message: "Video not found"}}, {status: 404});
    }

    // Check if processed_url exists
    if (!video.processed_url) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Watermarked video not found"}},
        {status: 404}
      );
    }

    // Resolve storage key for processed (watermarked) object
    let processedKey: string | null = null;
    if (video.processed_url.startsWith("http")) {
      processedKey = extractKeyFromUrl(video.processed_url);
    } else {
      processedKey = video.processed_url;
    }

    if (!processedKey) {
      return NextResponse.json(
        {success: false, error: {code: "invalid_data", message: "Missing or invalid processed video storage key"}},
        {status: 500}
      );
    }

    // Delete processed (watermarked) video file from Wasabi/S3
    try {
      const deleteProcessedCommand = new DeleteObjectCommand({
        Bucket: WASABI_BUCKET,
        Key: processedKey,
      });
      await wasabiClient.send(deleteProcessedCommand);
    } catch (error) {
      console.error("Error deleting watermarked file from Wasabi:", error);
      // Continue with database update even if file deletion fails
      // The file might already be deleted or not exist
    }

    // Delete processed thumbnail from Wasabi if it is a separate object (different key from original)
    const processedThumbnailUrl = (video as { processed_thumbnail_url?: string | null }).processed_thumbnail_url;
    const originalThumbnailUrl = (video as { original_thumbnail_url?: string | null }).original_thumbnail_url;
    if (processedThumbnailUrl && typeof processedThumbnailUrl === "string") {
      const processedThumbKey = processedThumbnailUrl.startsWith("http")
        ? extractKeyFromUrl(processedThumbnailUrl)
        : processedThumbnailUrl;
      const originalThumbKey =
        originalThumbnailUrl && typeof originalThumbnailUrl === "string"
          ? originalThumbnailUrl.startsWith("http")
            ? extractKeyFromUrl(originalThumbnailUrl)
            : originalThumbnailUrl
          : null;
      if (processedThumbKey && processedThumbKey !== originalThumbKey) {
        try {
          await wasabiClient.send(
            new DeleteObjectCommand({ Bucket: WASABI_BUCKET, Key: processedThumbKey })
          );
        } catch (thumbError) {
          console.error("Error deleting processed thumbnail from Wasabi:", thumbError);
        }
      }
    }

    // Update video record: remove processed_url, processed_thumbnail_url and reset status
    const {error: updateError} = await supabase
      .from("videos")
      .update({
        processed_url: null,
        processed_thumbnail_url: null,
        status: "uploaded", // Reset status to uploaded since watermark is removed
      })
      .eq("id", videoId);

    if (updateError) {
      console.error("Error updating video in database:", updateError);
      return NextResponse.json(
        {success: false, error: {code: "database_error", message: "Failed to update video record"}},
        {status: 500}
      );
    }

    // Clear any watermark queue jobs for this video (best-effort, do not fail response)
    const {data: profile} = await supabase
      .from("profiles")
      .select("numeric_user_id")
      .eq("id", user.id)
      .single();
    const numericUserId = profile?.numeric_user_id != null ? Number(profile.numeric_user_id) : NaN;
    if (Number.isInteger(numericUserId)) {
      await clearWatermarkQueueJobsForVideo(numericUserId, videoId);
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "Watermarked video deleted successfully",
        id: videoId,
      },
    });
  } catch (error: unknown) {
    console.error("Error deleting watermarked video:", error);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}

