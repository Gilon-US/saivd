import type {AppRole} from "@/lib/app-role";
import {isBootstrapSuperuserEmail} from "@/lib/bootstrap-superuser";
import {createClient} from "@/utils/supabase/server";

export type Role = AppRole;

export type AuthRoleError = {
  status: 401 | 403;
  message: string;
};

export interface RequireRoleResult {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: {id: string; email?: string | null};
  role: Role;
  error: AuthRoleError | null;
}

/**
 * Ensures the caller is authenticated and has one of the allowed roles.
 */
export async function requireRole(allowed: Role[]): Promise<RequireRoleResult> {
  const supabase = await createClient();
  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      supabase,
      user: {id: ""},
      role: "user",
      error: {status: 401, message: "Authentication required"},
    };
  }

  const {data: profile, error} = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const dbRole = (profile?.role as Role) ?? "user";
  const effective: Role = isBootstrapSuperuserEmail(user.email) ? "superuser" : dbRole;

  if (!allowed.includes(effective)) {
    return {
      supabase,
      user: {id: user.id, email: user.email},
      role: effective,
      error: {status: 403, message: "Forbidden"},
    };
  }

  const missingOrErrored = !!error || !profile;
  const bootstrapMissingProfileOk =
    isBootstrapSuperuserEmail(user.email) && effective === "superuser" && allowed.includes("superuser");

  if (missingOrErrored && !bootstrapMissingProfileOk) {
    return {
      supabase,
      user: {id: user.id, email: user.email},
      role: effective,
      error: {status: 403, message: "Forbidden"},
    };
  }

  return {
    supabase,
    user: {id: user.id, email: user.email},
    role: effective,
    error: null,
  };
}

export const requireStaff = () => requireRole(["admin", "superuser"]);

export const requireSuperuser = () => requireRole(["superuser"]);
