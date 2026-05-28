import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {createPresignedPost} from "@aws-sdk/s3-presigned-post";
import {wasabiClient, WASABI_BUCKET, URL_EXPIRATION_SECONDS} from "@/lib/wasabi";
import {getAllowedImageTypes, getMaxImageSizeBytes, getMaxImageSizeMb} from "@/lib/app-settings";
import {v4 as uuidv4} from "uuid";

/**
 * POST /api/images/upload
 * Generates a presigned POST URL for direct image upload to Wasabi.
 * No preprocessing or watermarking — images are stored as-is.
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

    const {filename, contentType, filesize} = await request.json();

    if (!filename || !contentType || !filesize) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Missing required fields: filename, contentType, filesize"}},
        {status: 400}
      );
    }

    const [allowedTypes, maxBytes, maxMb] = await Promise.all([
      getAllowedImageTypes(),
      getMaxImageSizeBytes(),
      getMaxImageSizeMb(),
    ]);

    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: `Invalid file type. Supported types: ${allowedTypes.join(", ")}`}},
        {status: 400}
      );
    }

    if (filesize > maxBytes) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: `File too large. Maximum size: ${maxMb} MB`}},
        {status: 400}
      );
    }

    const ext = filename.split(".").pop() ?? "jpg";
    const key = `images/${user.id}/${Date.now()}-${uuidv4()}.${ext}`;

    const presignedPost = await createPresignedPost(wasabiClient, {
      Bucket: WASABI_BUCKET,
      Key: key,
      Fields: {"Content-Type": contentType},
      Conditions: [
        ["content-length-range", 0, maxBytes],
        ["starts-with", "$Content-Type", "image/"],
      ],
      Expires: URL_EXPIRATION_SECONDS,
    });

    return NextResponse.json({
      success: true,
      data: {uploadUrl: presignedPost.url, fields: presignedPost.fields, key},
    });
  } catch (error) {
    console.error("Error creating image presigned URL:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to create upload URL"}},
      {status: 500}
    );
  }
}
