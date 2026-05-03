import {NextRequest, NextResponse} from "next/server";
import {PutObjectCommand} from "@aws-sdk/client-s3";
import {v4 as uuidv4} from "uuid";
import {createClient} from "@/utils/supabase/server";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {wasabiClient, WASABI_BUCKET} from "@/lib/wasabi";

const MAX_PHOTO_BYTES = 50 * 1024; // 50 KB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// POST /api/profile/photo — upload a profile photo to Wasabi and save URL to profiles.photo
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: {user},
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({success: false, error: "Authentication required"}, {status: 401});
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({success: false, error: "Expected multipart/form-data"}, {status: 400});
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({success: false, error: "No file provided"}, {status: 400});
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        {success: false, error: "Unsupported image type. Use JPEG, PNG, WebP, or GIF."},
        {status: 400}
      );
    }

    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({success: false, error: "Image must be 50 KB or smaller."}, {status: 400});
    }

    const ext = ALLOWED_EXTENSIONS[file.type] ?? "jpg";
    const key = `avatars/${user.id}/${uuidv4()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await wasabiClient.send(
      new PutObjectCommand({
        Bucket: WASABI_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        // No ACL — bucket has public access blocked; callers get presigned URLs
      })
    );

    // Store the S3 key (not a public URL). The profile API resolves it to a
    // short-lived presigned URL when returning profile data to clients.
    const serviceClient = createServiceRoleClient();
    const {error: updateError} = await serviceClient
      .from("profiles")
      .update({photo: key, updated_at: new Date().toISOString()})
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to save photo key to profile:", updateError);
      return NextResponse.json({success: false, error: "Upload succeeded but failed to save reference"}, {status: 500});
    }

    return NextResponse.json({success: true, data: {photo: key}});
  } catch (err) {
    console.error("Unexpected error in POST /api/profile/photo:", err);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}

// DELETE /api/profile/photo — remove the current photo (sets profiles.photo = null)
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: {user},
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({success: false, error: "Authentication required"}, {status: 401});
    }

    const serviceClient = createServiceRoleClient();
    const {error: updateError} = await serviceClient
      .from("profiles")
      .update({photo: null, updated_at: new Date().toISOString()})
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({success: false, error: "Failed to remove photo"}, {status: 500});
    }

    return NextResponse.json({success: true});
  } catch (err) {
    console.error("Unexpected error in DELETE /api/profile/photo:", err);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}
