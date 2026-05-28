import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {watermarkImageSync} from "@/lib/watermark-image";

/**
 * POST /api/images/[id]/watermark
 * Manually trigger (or retry) sync watermarking for an existing image upload.
 */
export async function POST(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: imageId} = await context.params;
    const requestId = `wmi_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!imageId?.trim()) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Image ID is required"}},
        {status: 400},
      );
    }

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
    const {data: image, error: imageError} = await serviceClient
      .from("images")
      .select("id, user_id, filename, original_url, status")
      .eq("id", imageId)
      .eq("user_id", user.id)
      .single();

    if (imageError || !image) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Image not found"}},
        {status: 404},
      );
    }

    if (!image.original_url) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Image has no original upload"}},
        {status: 400},
      );
    }

    if (image.status === "processing") {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Image is already being watermarked"}},
        {status: 409},
      );
    }

    await serviceClient
      .from("images")
      .update({
        status: "processing",
        watermark_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", image.id);

    const wmResult = await watermarkImageSync({
      imageId: image.id,
      userId: user.id,
      inputLocation: image.original_url,
    });

    if (!wmResult.success) {
      await serviceClient
        .from("images")
        .update({
          status: "failed",
          watermark_error: `${wmResult.code}: ${wmResult.message}`.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", image.id);

      console.warn("[image/watermark] Manual watermark failed", {
        requestId,
        imageId: image.id,
        code: wmResult.code,
        message: wmResult.message,
      });

      const status =
        wmResult.code === "watermark_timeout"
          ? 504
          : wmResult.code === "validation_error" || wmResult.code === "missing_profile_data"
            ? 400
            : wmResult.code === "not_found"
              ? 404
              : wmResult.code === "config_error"
                ? 500
                : 502;

      return NextResponse.json(
        {success: false, error: {code: wmResult.code, message: wmResult.message}},
        {status},
      );
    }

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
        watermark_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", image.id)
      .select()
      .single();

    if (updateError) {
      console.error("[image/watermark] Watermark succeeded but DB update failed", {
        requestId,
        imageId: image.id,
        updateError,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: image.id,
        filename: image.filename,
        status: updated?.status ?? "processed",
        processedUrl: wmResult.processedUrl,
        width,
        height,
      },
    });
  } catch (error) {
    console.error("[image/watermark] Unexpected error:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Server error"}},
      {status: 500},
    );
  }
}
