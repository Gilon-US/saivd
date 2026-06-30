import {NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";

/**
 * GET /api/images/dedup-index
 *
 * Lightweight list of filename + file_size for duplicate detection during batch upload.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {success: false, error: {code: "unauthorized", message: "Authentication required"}},
        {status: 401},
      );
    }

    const {data, error} = await supabase
      .from("images")
      .select("filename, file_size")
      .eq("user_id", user.id)
      .order("created_at", {ascending: false});

    if (error) {
      console.error("[images/dedup-index] query failed:", error);
      return NextResponse.json(
        {success: false, error: {code: "database_error", message: "Failed to load image index"}},
        {status: 500},
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        images: (data ?? []).map((row) => ({
          filename: row.filename,
          file_size: row.file_size,
        })),
      },
    });
  } catch (err) {
    console.error("[images/dedup-index] unexpected error:", err);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Server error"}},
      {status: 500},
    );
  }
}
