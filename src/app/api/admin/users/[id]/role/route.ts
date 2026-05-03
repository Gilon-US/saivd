import {NextRequest, NextResponse} from "next/server";
import {applyUserRoleChange} from "@/lib/server-user-role";
import {requireSuperuser} from "@/utils/auth-roles";

function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

function mapRpcError(message: string): {status: number} {
  const m = message.toLowerCase();
  if (m.includes("admin cap reached")) return {status: 409};
  if (m.includes("only superuser")) return {status: 403};
  if (m.includes("invalid role")) return {status: 400};
  if (m.includes("target user not found")) return {status: 404};
  if (m.includes("superuser cannot demote")) return {status: 403};
  if (m.includes("cannot create a second superuser")) return {status: 403};
  if (m.includes("role changes must go through")) return {status: 403};
  return {status: 500};
}

// POST /api/admin/users/[id]/role
export async function POST(request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;

    if (!isValidUUID(id)) {
      return NextResponse.json({success: false, error: {code: "validation_error", message: "Invalid user ID"}}, {status: 400});
    }

    const gate = await requireSuperuser();
    if (gate.error) {
      return NextResponse.json(
        {success: false, error: {code: "forbidden", message: gate.error.message}},
        {status: gate.error.status}
      );
    }

    const body = (await request.json()) as {role?: unknown};
    const role = body.role;
    if (role !== "user" && role !== "admin" && role !== "superuser") {
      return NextResponse.json({success: false, error: {code: "validation_error", message: "Invalid role"}}, {status: 400});
    }

    const applied = await applyUserRoleChange({
      actorUserId: gate.user.id,
      targetId: id,
      newRole: role,
      request,
    });

    if (!applied.ok) {
      const {status} = mapRpcError(applied.message);
      return NextResponse.json({success: false, error: {code: "rpc_error", message: applied.message}}, {status});
    }

    return NextResponse.json({success: true, data: {id, role}});
  } catch (err) {
    console.error("POST /api/admin/users/[id]/role:", err);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}
