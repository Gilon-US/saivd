import {NextResponse} from "next/server";
import {requireAdminUser} from "@/utils/admin";

// GET /api/admin/users
// Returns a paginated list of user profiles for admin users only
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pageParam = url.searchParams.get("page");
    const limitParam = url.searchParams.get("limit");

    const page = Math.max(parseInt(pageParam || "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 1), 100);

    const {supabase, error: adminError} = await requireAdminUser();
    if (adminError) {
      return NextResponse.json({success: false, error: adminError.message}, {status: adminError.status});
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const {data, error, count} = await supabase
      .from("profiles")
      .select("id, numeric_user_id, display_name, email, avatar_url, role", {count: "exact"})
      .range(from, to)
      .order("numeric_user_id", {ascending: true});

    if (error) {
      console.error("Error fetching admin user list:", error);
      return NextResponse.json({success: false, error: "Failed to fetch users"}, {status: 500});
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/admin/users:", err);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}
