import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";

// GET /api/users/[numericUserId]/public-key
// Public endpoint that returns the creator's public RSA key (PEM) for watermark verification.
export async function GET(_request: NextRequest, context: {params: Promise<{numericUserId: string}>}) {
  try {
    const {numericUserId} = await context.params;

    const idNum = Number(numericUserId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Invalid numeric user ID"}},
        {status: 400}
      );
    }

    const supabase = await createClient();

    const {data: profile, error} = await supabase
      .from("profiles")
      .select("id, rsa_public")
      .eq("numeric_user_id", idNum)
      .single();

    if (error || !profile) {
      return NextResponse.json({success: false, error: {code: "not_found", message: "User not found"}}, {status: 404});
    }

    if (!profile.rsa_public) {
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Public key not available for this user"}},
        {status: 404}
      );
    }

    return NextResponse.json(
      {success: true, data: {public_key_pem: profile.rsa_public}},
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=300",
        },
      }
    );
  } catch (error) {
    console.error("Unexpected error in GET /api/users/[numericUserId]/public-key:", error);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}
