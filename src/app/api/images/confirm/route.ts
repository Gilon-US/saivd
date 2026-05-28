import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {HeadObjectCommand} from "@aws-sdk/client-s3";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";

/**
 * POST /api/images/confirm
 * Verifies the image was successfully uploaded to Wasabi, then stores the record.
 * No normalization, no watermarking — the original file is the final file.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {data: {user}} = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {success: false, error: {code: "unauthorized", message: "Authentication required"}},
        {status: 401}
      );
    }

    const {key, filename, filesize, contentType} = await request.json();

    if (!key || !filename || !filesize || !contentType) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Missing required fields"}},
        {status: 400}
      );
    }

    // Verify the file exists in Wasabi
    try {
      await wasabiClient.send(new HeadObjectCommand({Bucket: WASABI_BUCKET, Key: key}));
    } catch {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Uploaded file not found in storage"}},
        {status: 404}
      );
    }

    // Insert image record — use service role to avoid RLS edge cases
    const serviceClient = createServiceRoleClient();
    const {data: image, error} = await serviceClient
      .from("images")
      .insert({
        user_id: user.id,
        filename,
        file_size: filesize,
        content_type: contentType,
        original_url: key,
        status: "uploaded",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error storing image metadata:", error);
      return NextResponse.json(
        {success: false, error: {code: "database_error", message: "Failed to store image metadata"}},
        {status: 500}
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: image.id,
        key,
        filename: image.filename,
        originalUrl: image.original_url,
        createdAt: image.created_at,
      },
    });
  } catch (error) {
    console.error("Error confirming image upload:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to confirm upload"}},
      {status: 500}
    );
  }
}
