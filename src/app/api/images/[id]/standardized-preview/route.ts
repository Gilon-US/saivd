import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {WASABI_BUCKET} from "@/lib/wasabi";

function buildStandardizePreviewEndpoint(): string | null {
  const base = (process.env.WATERMARK_SERVICE_URL ?? "").replace(/\/+$/, "");
  if (!base) return null;
  if (base.endsWith("/image/standardize-preview")) return base;
  if (base.endsWith("/image")) return `${base}/standardize-preview`;
  return `${base}/image/standardize-preview`;
}

/**
 * GET /api/images/[id]/standardized-preview
 *
 * Same-origin proxy for the pre-watermark standardization pipeline (sRGB PNG).
 * Used for a fair color comparison next to the watermarked output in the dashboard.
 */
export async function GET(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: imageId} = await context.params;
    const endpoint = buildStandardizePreviewEndpoint();
    if (!endpoint) {
      return NextResponse.json(
        {
          success: false,
          error: {code: "config_error", message: "WATERMARK_SERVICE_URL is not configured on the server"},
        },
        {status: 500},
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

    const {data: image, error} = await supabase
      .from("images")
      .select("id, user_id, original_url")
      .eq("id", imageId)
      .eq("user_id", user.id)
      .single();

    if (error || !image) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Image not found"}},
        {status: 404},
      );
    }

    if (!image.original_url) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Original upload not available"}},
        {status: 404},
      );
    }

    const timeoutMs = Number(process.env.WATERMARK_TIMEOUT_MS ?? 30_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json", Connection: "close"},
        body: JSON.stringify({
          input_location: image.original_url,
          bucket: WASABI_BUCKET,
        }),
        signal: controller.signal,
      });
    } catch (e: unknown) {
      clearTimeout(timer);
      console.error("[images/standardized-preview] Manager request failed", {imageId, error: e});
      return NextResponse.json(
        {
          success: false,
          error: {code: "server_error", message: "Failed to reach image standardization service"},
        },
        {status: 502},
      );
    }
    clearTimeout(timer);

    if (!response.ok) {
      const detail = await response.text();
      console.error("[images/standardized-preview] Manager error", {
        imageId,
        status: response.status,
        detail: detail.slice(0, 500),
      });
      return NextResponse.json(
        {
          success: false,
          error: {code: "server_error", message: "Image standardization preview failed"},
        },
        {status: 502},
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[images/standardized-preview] Unexpected error:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to load standardized preview"}},
      {status: 500},
    );
  }
}
