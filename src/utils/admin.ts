import {createClient} from "@/utils/supabase/server";

export type RequireAdminError = {
  status: 401 | 403;
  message: string;
};

export interface RequireAdminResult {
  supabase: Awaited<ReturnType<typeof createClient>>;
  error: RequireAdminError | null;
}

/**
 * requireAdminUser
 *
 * Server-side helper for API routes that need to ensure the caller is an
 * authenticated admin user. Returns a Supabase client plus an error object
 * describing 401/403 cases, or null error when the caller is an admin.
 */
export async function requireAdminUser(): Promise<RequireAdminResult> {
  const supabase = await createClient();

  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {supabase, error: {status: 401, message: "Authentication required"}};
  }

  const {data: callerProfile, error: callerError} = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (callerError || !callerProfile || callerProfile.role !== "admin") {
    return {supabase, error: {status: 403, message: "Admin access required"}};
  }

  return {supabase, error: null};
}
