import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {generateAndUploadUserQrCode, getUserQrCodeImage} from "@/lib/qr-codes";

// GET /profile/[userId]/qr
// Public endpoint that returns a PNG QR code for the user's public profile URL.
// "userId" here is the numeric_user_id used in public profile URLs.
export async function GET(_request: NextRequest, context: {params: Promise<{userId: string}>}) {
  try {
    const {userId} = await context.params;

    const idNum = Number(userId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Invalid numeric user ID"}},
        {status: 400}
      );
    }

    const supabase = await createClient();

    const {data: profile, error} = await supabase
      .from("profiles")
      .select("id, numeric_user_id")
      .eq("numeric_user_id", idNum)
      .single();

    if (error || !profile) {
      return NextResponse.json({success: false, error: {code: "not_found", message: "User not found"}}, {status: 404});
    }

    // Ensure QR code exists in Wasabi (idempotent overwrite is fine)
    await generateAndUploadUserQrCode(idNum);

    const imageBuffer = await getUserQrCodeImage(idNum);

    if (!imageBuffer) {
      return NextResponse.json(
        {success: false, error: {code: "qr_error", message: "QR code not available"}},
        {status: 500}
      );
    }

    return new NextResponse(imageBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // Short cache; you can tune this later
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /profile/[userId]/qr:", error);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}
