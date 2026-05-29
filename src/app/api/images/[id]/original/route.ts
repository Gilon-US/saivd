import {NextRequest, NextResponse} from "next/server";
import {GetObjectCommand} from "@aws-sdk/client-s3";
import {createClient} from "@/utils/supabase/server";
import {extractKeyFromUrl} from "@/lib/wasabi-urls";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";

/**
 * GET /api/images/[id]/original
 *
 * Same-origin proxy for the uploaded original bytes. Used for downloads (and
 * any client fetch that must avoid CORS on presigned Wasabi URLs).
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
      .select("id, user_id, original_url, content_type, filename")
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

    let key = image.original_url;
    if (key.startsWith("http://") || key.startsWith("https://")) {
      const extracted = extractKeyFromUrl(key);
      if (!extracted) {
        return NextResponse.json(
          {success: false, error: {code: "invalid_data", message: "Invalid original storage key"}},
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
        {success: false, error: {code: "not_found", message: "Original file not found in storage"}},
        {status: 404},
      );
    }

    const bytes = Buffer.from(await body.transformToByteArray());
    const contentType = image.content_type ?? obj.ContentType ?? "application/octet-stream";

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("[images/original] Error streaming original image:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to load original image"}},
      {status: 500},
    );
  }
}
