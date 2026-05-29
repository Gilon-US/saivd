import {NextRequest, NextResponse} from "next/server";
import {DeleteObjectCommand} from "@aws-sdk/client-s3";
import {createClient} from "@/utils/supabase/server";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {extractKeyFromUrl} from "@/lib/wasabi-urls";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";

/**
 * DELETE /api/images/[id]/watermarked
 *
 * Deletes the watermarked (processed) image from Wasabi and clears processed
 * fields so the image returns to "uploaded" state. The original upload is unchanged.
 */
export async function DELETE(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: imageId} = await context.params;

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

    const serviceClient = createServiceRoleClient();
    const {data: image, error: fetchError} = await serviceClient
      .from("images")
      .select("id, user_id, processed_url, status")
      .eq("id", imageId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !image) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Image not found"}},
        {status: 404},
      );
    }

    if (!image.processed_url) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Watermarked image not found"}},
        {status: 404},
      );
    }

    let processedKey: string | null = null;
    if (image.processed_url.startsWith("http")) {
      processedKey = extractKeyFromUrl(image.processed_url);
    } else {
      processedKey = image.processed_url;
    }

    if (!processedKey) {
      return NextResponse.json(
        {success: false, error: {code: "invalid_data", message: "Missing or invalid processed image storage key"}},
        {status: 500},
      );
    }

    try {
      await wasabiClient.send(
        new DeleteObjectCommand({
          Bucket: WASABI_BUCKET,
          Key: processedKey,
        }),
      );
    } catch (error) {
      console.error("[images/watermarked] Error deleting watermarked file from Wasabi:", error);
    }

    const {error: updateError} = await serviceClient
      .from("images")
      .update({
        processed_url: null,
        width: null,
        height: null,
        watermark_error: null,
        watermarked_at: null,
        status: "uploaded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", imageId);

    if (updateError) {
      console.error("[images/watermarked] Error updating image in database:", updateError);
      return NextResponse.json(
        {success: false, error: {code: "database_error", message: "Failed to update image record"}},
        {status: 500},
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "Watermarked image deleted successfully",
        id: imageId,
      },
    });
  } catch (error: unknown) {
    console.error("[images/watermarked] Error deleting watermarked image:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Server error"}},
      {status: 500},
    );
  }
}
