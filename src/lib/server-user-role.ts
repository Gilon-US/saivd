import {isBootstrapSuperuserEmail} from "@/lib/bootstrap-superuser";
import type {AppRole} from "@/lib/app-role";
import {writeAudit} from "@/utils/audit";
import {createServiceRoleClient} from "@/utils/supabase/service";

/** Mirrors `public.set_user_role` rules; used with service role (bypasses role-change trigger). */
export function getSetUserRoleBlocker(input: {
  actorRole: string | null | undefined;
  actorEmail: string | null | undefined;
  actorUserId: string;
  targetId: string;
  targetRole: string | null | undefined;
  newRole: AppRole;
  /** Count of profiles with role = admin; only needed when promoting to admin. */
  adminCount: number;
}): string | null {
  const privileged =
    input.actorRole === "superuser" || isBootstrapSuperuserEmail(input.actorEmail);
  if (!privileged) {
    return "only superuser can change roles";
  }

  if (input.targetId === input.actorUserId && input.newRole !== "superuser") {
    return "superuser cannot demote themselves";
  }

  if (input.newRole === "superuser" && input.targetId !== input.actorUserId) {
    return "cannot create a second superuser";
  }

  if (input.newRole === "admin" && input.targetRole !== "admin" && input.adminCount >= 3) {
    return "admin cap reached (3)";
  }

  return null;
}

export async function applyUserRoleChange(params: {
  actorUserId: string;
  targetId: string;
  newRole: AppRole;
  request?: Request;
}): Promise<{ok: true} | {ok: false; message: string}> {
  const svc = createServiceRoleClient();

  const {data: actor, error: actorErr} = await svc
    .from("profiles")
    .select("role, email")
    .eq("id", params.actorUserId)
    .maybeSingle();

  if (actorErr || !actor) {
    return {ok: false, message: "only superuser can change roles"};
  }

  const {data: target, error: targetErr} = await svc
    .from("profiles")
    .select("role")
    .eq("id", params.targetId)
    .single();

  if (targetErr?.code === "PGRST116" || !target) {
    return {ok: false, message: "target user not found"};
  }

  const targetRole = (target.role as string | null | undefined) ?? "user";

  let adminCount = 0;
  if (params.newRole === "admin" && targetRole !== "admin") {
    const {count, error: countErr} = await svc
      .from("profiles")
      .select("id", {count: "exact", head: true})
      .eq("role", "admin");
    if (countErr) {
      console.error("applyUserRoleChange admin count:", countErr);
      return {ok: false, message: countErr.message || "Role update failed"};
    }
    adminCount = count ?? 0;
  }

  const blocker = getSetUserRoleBlocker({
    actorRole: actor.role as string | null | undefined,
    actorEmail: actor.email,
    actorUserId: params.actorUserId,
    targetId: params.targetId,
    targetRole,
    newRole: params.newRole,
    adminCount,
  });

  if (blocker) {
    return {ok: false, message: blocker};
  }

  const {error: updErr} = await svc
    .from("profiles")
    .update({role: params.newRole, updated_at: new Date().toISOString()})
    .eq("id", params.targetId);

  if (updErr) {
    console.error("applyUserRoleChange update:", updErr);
    return {ok: false, message: updErr.message || "Role update failed"};
  }

  // Audit is best-effort: role update already succeeded; do not roll back if audit table is missing.
  try {
    await writeAudit({
      actorId: params.actorUserId,
      action: "set_user_role",
      targetId: params.targetId,
      before: {role: targetRole},
      after: {role: params.newRole},
      request: params.request,
    });
  } catch (e) {
    console.warn("applyUserRoleChange: audit write failed (non-fatal — apply migrations to enable audit logging):", e);
  }

  return {ok: true};
}
