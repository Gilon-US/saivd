import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {HeadObjectCommand} from "@aws-sdk/client-s3";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";
import {watermarkImageSync} from "@/lib/watermark-image";

/**
 * POST /api/images/confirm
 *
 * 1. Verify the original was uploaded to Wasabi.
 * 2. Insert the `public.images` row with status='uploaded'.
 * 3. Auto-trigger sync watermarking (the backend manager's POST /image/watermark).
 *    - On success: update row with processed_url, status='processed', dimensions.
 *    - On failure: update row with status='failed' and the error code in
 *      watermark_error; the original_url is still useful.
 *
 * The route always returns 200 if the upload itself succeeded, with the
 * final row state in the response body. Watermark failure does not roll
 * back the upload (the original is still recoverable).
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

    // Step 1: verify the file is in Wasabi.
    try {
      await wasabiClient.send(new HeadObjectCommand({Bucket: WASABI_BUCKET, Key: key}));
    } catch {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Uploaded file not found in storage"}},
        {status: 404}
      );
    }

    // Step 2: insert row with status='uploaded'.
    const serviceClient = createServiceRoleClient();
    const {data: image, error: insertError} = await serviceClient
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

    if (insertError || !image) {
      console.error("Error storing image metadata:", insertError);
      return NextResponse.json(
        {success: false, error: {code: "database_error", message: "Failed to store image metadata"}},
        {status: 500}
      );
    }

    // Step 3: auto-trigger sync watermark. Update status to 'processing'
    // first so a concurrent GET sees the transient state correctly.
    await serviceClient
      .from("images")
      .update({status: "processing", updated_at: new Date().toISOString()})
      .eq("id", image.id);

    const wmStart = Date.now();
    const wmResult = await watermarkImageSync({
      imageId: image.id,
      userId: user.id,
      inputLocation: key,
    });
    const wmDurationMs = Date.now() - wmStart;

    if (!wmResult.success) {
      // Mark the row failed but still return 200 — the upload succeeded.
      await serviceClient
        .from("images")
        .update({
          status: "failed",
          watermark_error: `${wmResult.code}: ${wmResult.message}`.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", image.id);

      console.warn("[confirm] Watermark failed; row marked failed", {
        imageId: image.id,
        code: wmResult.code,
        message: wmResult.message,
        durationMs: wmDurationMs,
      });

      return NextResponse.json({
        success: true,
        data: {
          id: image.id,
          key,
          filename: image.filename,
          originalUrl: image.original_url,
          createdAt: image.created_at,
          status: "failed",
          watermarkError: `${wmResult.code}: ${wmResult.message}`,
        },
      });
    }

    // Persist watermark result. Width/height come from standardization
    // metadata when available (final_size: [w, h]); fall back to null.
    const finalSize = (wmResult.standardization?.final_size as [number, number] | undefined) ?? null;
    const width = finalSize ? finalSize[0] : null;
    const height = finalSize ? finalSize[1] : null;

    const {data: updated, error: updateError} = await serviceClient
      .from("images")
      .update({
        status: "processed",
        processed_url: wmResult.processedUrl,
        width,
        height,
        watermarked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", image.id)
      .select()
      .single();

    if (updateError) {
      console.error("[confirm] Watermark succeeded but DB update failed", {
        imageId: image.id,
        processedUrl: wmResult.processedUrl,
        updateError,
      });
      // The image is watermarked in Wasabi; the row is just stale. Return success
      // with the data we have so the client can re-fetch.
    }

    console.log("[confirm] Watermark complete", {
      imageId: image.id,
      processedUrl: wmResult.processedUrl,
      durationMs: wmDurationMs,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: image.id,
        key,
        filename: image.filename,
        originalUrl: image.original_url,
        processedUrl: wmResult.processedUrl,
        createdAt: image.created_at,
        status: updated?.status ?? "processed",
        width,
        height,
        standardization: wmResult.standardization,
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
