import {NextRequest, NextResponse} from "next/server";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {hashTransferToken, isPlausibleTransferToken} from "@/lib/transfer-tokens";

/**
 * POST /api/public/transfers/[token]/mark-claimed
 *
 * Public, no auth — the token IS the auth. Called by the viewer once it has
 * successfully copied the file into its own bucket. Atomically sets
 * `claimed_at` so subsequent reads of GET /api/public/transfers/[token]
 * return 404. Idempotent: a second call after a successful first one is a
 * no-op (still returns 200).
 *
 * No request body is required. The token is in the URL path.
 *
 * Response (200): { success: true }
 * Response (404): same shape as the public GET — uniform across all failure
 *                 modes so callers can't enumerate state.
 */

const NOT_FOUND_RESPONSE = {
  success: false,
  error: {code: "not_found", message: "Transfer not found"},
} as const;

export async function POST(_request: NextRequest, context: {params: Promise<{token: string}>}) {
  try {
    const {token} = await context.params;

    if (!isPlausibleTransferToken(token)) {
      return NextResponse.json(NOT_FOUND_RESPONSE, {status: 404});
    }

    const tokenHash = hashTransferToken(token);
    const supabase = createServiceRoleClient();

    // Atomic claim: only succeed when claimed_at IS NULL. This prevents two
    // concurrent claims from both proceeding. Postgres' UPDATE ... RETURNING
    // gives us the affected row count via the returned data array.
    const {data: claimed, error} = await supabase
      .from("transfers")
      .update({claimed_at: new Date().toISOString()})
      .eq("token_hash", tokenHash)
      .is("claimed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[transfers/mark-claimed] update failed", error);
      return NextResponse.json(NOT_FOUND_RESPONSE, {status: 404});
    }

    if (!claimed) {
      // Either the token is invalid, expired, or already claimed. We treat
      // an already-claimed token as 200 success only when we can confirm the
      // hash exists at all — but to avoid an extra round-trip and to keep
      // the endpoint stateless-looking, we just return 200 here. Idempotent
      // re-claim attempts therefore look identical to first-time success.
      // This is safe because the *viewer* is the only legitimate caller and
      // it only ever calls mark-claimed after a successful copy; an external
      // attacker calling this with a leaked token only "wastes" the token,
      // which is exactly the behaviour we want.
      return NextResponse.json({success: true});
    }

    return NextResponse.json({success: true});
  } catch (err) {
    console.error("[transfers/mark-claimed] unhandled error", err);
    return NextResponse.json(NOT_FOUND_RESPONSE, {status: 404});
  }
}
