import {NextResponse} from "next/server";
import {BOOTSTRAP_SUPERUSER_EMAIL} from "@/lib/bootstrap-superuser";
import {requireStaff} from "@/utils/auth-roles";

const summarySelect = "id, numeric_user_id, display_name, email, role";

// GET /api/admin/admins
export async function GET() {
  try {
    const {supabase, error} = await requireStaff();
    if (error) {
      return NextResponse.json({success: false, error: error.message}, {status: error.status});
    }

    const {data: bootstrapRows, error: bootErr} = await supabase
      .from("profiles")
      .select(summarySelect)
      .ilike("email", BOOTSTRAP_SUPERUSER_EMAIL)
      .limit(1);

    if (bootErr) {
      console.error("GET /api/admin/admins bootstrap profile:", bootErr);
      return NextResponse.json({success: false, error: "Failed to load bootstrap profile"}, {status: 500});
    }

    const {data: superuserRow, error: suErr} = await supabase
      .from("profiles")
      .select(summarySelect)
      .eq("role", "superuser")
      .limit(2);

    if (suErr) {
      console.error("GET /api/admin/admins superuser:", suErr);
      return NextResponse.json({success: false, error: "Failed to load superuser"}, {status: 500});
    }

    const bootstrap = bootstrapRows && bootstrapRows.length > 0 ? bootstrapRows[0] : null;
    const fromDbRole = superuserRow && superuserRow.length > 0 ? superuserRow[0] : null;
    const superuser = bootstrap ? {...bootstrap, role: "superuser"} : fromDbRole;

    const {data: admins, error: adErr} = await supabase
      .from("profiles")
      .select(summarySelect)
      .eq("role", "admin")
      .order("numeric_user_id", {ascending: true});

    if (adErr) {
      console.error("GET /api/admin/admins admins:", adErr);
      return NextResponse.json({success: false, error: "Failed to load admins"}, {status: 500});
    }

    const adminList = admins || [];
    return NextResponse.json({
      success: true,
      data: {
        superuser,
        admins: adminList,
        adminCount: adminList.length,
        adminCap: 3,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/admins:", err);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}
