import {NextRequest, NextResponse} from "next/server";
import {GetObjectCommand} from "@aws-sdk/client-s3";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {extractKeyFromUrl} from "@/lib/wasabi-urls";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {status: 204, headers: {...CORS_HEADERS}});
}

/**
 * GET /api/public/images/[id]/processed
 *
 * Same-origin proxy for watermarked PNG bytes on public /i and /embed/i pages.
 * No session required — used by in-browser watermark verification (createImageBitmap).
 */
export async function GET(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: imageId} = await context.params;

    const supabase = createServiceRoleClient();
    const {data: image, error} = await supabase
      .from("images")
      .select("id, processed_url, content_type, status")
      .eq("id", imageId)
      .maybeSingle();

    if (error) {
      console.error("[public/images/processed] Supabase error:", error);
      return NextResponse.json(
        {success: false, error: {code: "server_error", message: "Failed to load image"}},
        {status: 500, headers: {...CORS_HEADERS}},
      );
    }

    if (!image) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Image not found"}},
        {status: 404, headers: {...CORS_HEADERS}},
      );
    }

    if (!image.processed_url || image.status !== "processed") {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Watermarked version not available"}},
        {status: 404, headers: {...CORS_HEADERS}},
      );
    }

    let key = image.processed_url;
    if (key.startsWith("http://") || key.startsWith("https://")) {
      const extracted = extractKeyFromUrl(key);
      if (!extracted) {
        return NextResponse.json(
          {success: false, error: {code: "invalid_data", message: "Invalid processed storage key"}},
          {status: 500, headers: {...CORS_HEADERS}},
        );
      }
      key = extracted;
    }

    const obj = await wasabiClient.send(
      new GetObjectCommand({
        Bucket: WASABI_BUCKET,
        Key: key,
      }),
    );

    const body = obj.Body;
    if (!body) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Processed file not found in storage"}},
        {status: 404, headers: {...CORS_HEADERS}},
      );
    }

    const bytes = Buffer.from(await body.transformToByteArray());
    const contentType = image.content_type?.includes("png")
      ? "image/png"
      : obj.ContentType ?? "image/png";

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("[public/images/processed] Error streaming processed image:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to load processed image"}},
      {status: 500, headers: {...CORS_HEADERS}},
    );
  }
}
