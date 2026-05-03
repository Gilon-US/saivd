import {createServiceRoleClient} from "@/utils/supabase/service";

function formatAuditError(err: {message?: string; details?: string; hint?: string; code?: string}): string {
  const parts = [err.message, err.details, err.hint, err.code ? `(${err.code})` : ""].filter(Boolean);
  return parts.join(" — ") || "Audit log write failed";
}

export async function writeAudit(opts: {
  actorId: string;
  action: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  request?: Request;
}): Promise<void> {
  const ip = opts.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = opts.request?.headers.get("user-agent") ?? null;
  const sb = createServiceRoleClient();

  const row: Record<string, unknown> = {
    actor_id: opts.actorId,
    action: opts.action,
    target_id: opts.targetId ?? null,
    ip,
    user_agent: ua,
  };
  row["before"] = opts.before ?? null;
  row["after"] = opts.after ?? null;

  const {error} = await sb.from("admin_audit_log").insert(row);
  if (error) {
    console.error("writeAudit insert failed:", error);
    throw new Error(formatAuditError(error));
  }
}
