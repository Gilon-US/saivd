import {NextRequest, NextResponse} from "next/server";
import {createServiceRoleClient} from "@/utils/supabase/service";

function isDuplicateUserError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already") ||
    lower.includes("registered") ||
    lower.includes("exists") ||
    lower.includes("duplicate")
  );
}

function isSupabaseValidationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("invalid") ||
    lower.includes("validate") ||
    lower.includes("password should") ||
    lower.includes("weak password")
  );
}

function authErrorResponse(error: {message: string}) {
  if (isDuplicateUserError(error.message)) {
    return {
      status: 409 as const,
      body: {success: false, error: {code: "conflict", message: "This email is already registered"}},
    };
  }
  if (isSupabaseValidationError(error.message)) {
    return {
      status: 400 as const,
      body: {
        success: false,
        error: {
          code: "validation_error",
          message: error.message.includes("email")
            ? "Invalid email address"
            : error.message,
        },
      },
    };
  }
  return {
    status: 500 as const,
    body: {
      success: false,
      error: {code: "server_error", message: error.message || "Failed to create account"},
    },
  };
}

async function findUserByEmail(
  admin: ReturnType<typeof createServiceRoleClient>["auth"]["admin"],
  email: string,
) {
  for (let page = 1; page <= 5; page++) {
    const {data, error} = await admin.listUsers({page, perPage: 200});
    if (error || !data.users.length) return null;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * POST /api/auth/register
 *
 * Creates a confirmed auth user (no email verification step). Profile row is
 * created by the handle_new_user trigger on auth.users.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Invalid email address"}},
        {status: 400},
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Password must be at least 6 characters"}},
        {status: 400},
      );
    }

    const supabase = createServiceRoleClient();

    const {data, error} = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (!error && data.user) {
      return NextResponse.json({
        success: true,
        data: {userId: data.user.id},
      });
    }

    if (error && isDuplicateUserError(error.message)) {
      const existing = await findUserByEmail(supabase.auth.admin, email);

      if (!existing) {
        return NextResponse.json(
          {success: false, error: {code: "conflict", message: "This email is already registered"}},
          {status: 409},
        );
      }

      const {error: updateError} = await supabase.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
        password,
      });

      if (updateError) {
        console.error("[auth/register] Failed to confirm existing user:", updateError);
        return NextResponse.json(
          {success: false, error: {code: "conflict", message: "This email is already registered"}},
          {status: 409},
        );
      }

      return NextResponse.json({
        success: true,
        data: {userId: existing.id, existing: true},
      });
    }

    console.error("[auth/register] createUser failed:", error);
    const mapped = authErrorResponse(error ?? {message: "Failed to create account"});
    return NextResponse.json(mapped.body, {status: mapped.status});
  } catch (err) {
    console.error("[auth/register] Unexpected error:", err);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to create account"}},
      {status: 500},
    );
  }
}
