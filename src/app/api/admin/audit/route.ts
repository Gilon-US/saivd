import {NextRequest, NextResponse} from "next/server";
import {requireStaff} from "@/utils/auth-roles";
import {createServiceRoleClient} from "@/utils/supabase/service";

const MAX_LIMIT = 100;

// GET /api/admin/audit?limit=50&before=<iso>
export async function GET(request: NextRequest) {
  try {
    const gate = await requireStaff();
    if (gate.error) {
      return NextResponse.json({success: false, error: gate.error.message}, {status: gate.error.status});
    }

    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const before = url.searchParams.get("before");

    const limit = Math.min(Math.max(parseInt(limitRaw || "50", 10) || 50, 1), MAX_LIMIT);

    const sb = createServiceRoleClient();
    let q = sb
      .from("admin_audit_log")
      .select('id, actor_id, action, target_id, "before", "after", ip, user_agent, created_at')
      .order("created_at", {ascending: false})
      .limit(limit);

    if (before) {
      const t = Date.parse(before);
      if (Number.isNaN(t)) {
        return NextResponse.json({success: false, error: "Invalid before cursor"}, {status: 400});
      }
      q = q.lt("created_at", new Date(t).toISOString());
    }

    const {data, error} = await q;

    if (error) {
      console.error("GET /api/admin/audit:", error);
      return NextResponse.json({success: false, error: "Failed to load audit log"}, {status: 500});
    }

    return NextResponse.json({success: true, data: data || []});
  } catch (err) {
    console.error("GET /api/admin/audit:", err);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}
