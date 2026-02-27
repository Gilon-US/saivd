import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";

/** CORS headers for public-key endpoint (accessible from other frontends and backends). */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

function withCors(response: NextResponse): NextResponse {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/** Preflight: allow cross-origin GET from any origin. */
export async function OPTIONS() {
  return withCors(new NextResponse(null, {status: 204}));
}

// GET /api/users/[numericUserId]/public-key
// Public endpoint that returns the creator's public RSA key (PEM) for watermark verification.
// CORS-enabled for cross-origin access from third-party frontends and backends.
export async function GET(_request: NextRequest, context: {params: Promise<{numericUserId: string}>}) {
  try {
    const {numericUserId} = await context.params;

    const idNum = Number(numericUserId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      const res = NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Invalid numeric user ID"}},
        {status: 400}
      );
      return withCors(res);
    }

    const supabase = await createClient();

    const {data: profile, error} = await supabase
      .from("profiles")
      .select("id, rsa_public")
      .eq("numeric_user_id", idNum)
      .single();

    if (error || !profile) {
      const res = NextResponse.json({success: false, error: {code: "not_found", message: "User not found"}}, {status: 404});
      return withCors(res);
    }

    if (!profile.rsa_public) {
      const res = NextResponse.json(
        {success: false, error: {code: "not_found", message: "Public key not available for this user"}},
        {status: 404}
      );
      return withCors(res);
    }

    const res = NextResponse.json(
      {success: true, data: {public_key_pem: profile.rsa_public}},
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=300",
        },
      }
    );
    return withCors(res);
  } catch (error) {
    console.error("Unexpected error in GET /api/users/[numericUserId]/public-key:", error);
    const res = NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
    return withCors(res);
  }
}
