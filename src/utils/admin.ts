import {createClient} from "@/utils/supabase/server";
import {requireStaff} from "./auth-roles";

export type RequireAdminError = {
  status: 401 | 403;
  message: string;
};

export interface RequireAdminResult {
  supabase: Awaited<ReturnType<typeof createClient>>;
  error: RequireAdminError | null;
}

/**
 * Staff-only (admin or superuser). Preserves the historical name `requireAdminUser`.
 */
export async function requireAdminUser(): Promise<RequireAdminResult> {
  const {supabase, error} = await requireStaff();
  return {supabase, error};
}
