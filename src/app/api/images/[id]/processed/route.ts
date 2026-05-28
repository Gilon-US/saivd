import {NextRequest, NextResponse} from "next/server";
import {GetObjectCommand} from "@aws-sdk/client-s3";
import {createClient} from "@/utils/supabase/server";
import {extractKeyFromUrl} from "@/lib/wasabi-urls";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";

/**
 * GET /api/images/[id]/processed
 *
 * Same-origin proxy for the watermarked PNG bytes. Used by the in-browser
 * verifier (createImageBitmap) and the lightbox — avoids CORS on presigned
 * Wasabi URLs when fetching pixel data from localhost.
 */
export async function GET(_request: NextRequest, context: {params: Promise<{id: string}>}) {
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

    const {data: image, error} = await supabase
      .from("images")
      .select("id, user_id, processed_url, content_type, status")
      .eq("id", imageId)
      .eq("user_id", user.id)
      .single();

    if (error || !image) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Image not found"}},
        {status: 404},
      );
    }

    if (!image.processed_url || image.status !== "processed") {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Watermarked version not available"}},
        {status: 404},
      );
    }

    let key = image.processed_url;
    if (key.startsWith("http://") || key.startsWith("https://")) {
      const extracted = extractKeyFromUrl(key);
      if (!extracted) {
        return NextResponse.json(
          {success: false, error: {code: "invalid_data", message: "Invalid processed storage key"}},
          {status: 500},
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
        {status: 404},
      );
    }

    const bytes = Buffer.from(await body.transformToByteArray());
    const contentType = image.content_type?.includes("png")
      ? "image/png"
      : obj.ContentType ?? "image/png";

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("[images/processed] Error streaming processed image:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to load processed image"}},
      {status: 500},
    );
  }
}
