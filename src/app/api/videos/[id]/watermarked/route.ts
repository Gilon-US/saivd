import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {DeleteObjectCommand} from "@aws-sdk/client-s3";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";
import {extractKeyFromUrl} from "@/lib/wasabi-urls";

/**
 * DELETE /api/videos/[id]/watermarked
 *
 * Deletes only the watermarked (processed) video file for the authenticated user.
 * This does NOT delete the original video or the video record itself.
 * Only removes the processed_url reference from the database.
 *
 * Response:
 * - success: Boolean indicating if the request was successful
 * - data: Object containing success message
 * - error: Object containing error details if request failed
 */
export async function DELETE(request: NextRequest, context: {params: Promise<{id: string}>}) {
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

    // Delete processed (watermarked) file from Wasabi
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

    // Update video record: remove processed_url and update status
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

