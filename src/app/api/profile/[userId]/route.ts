import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";

/**
 * GET /api/profile/[userId]
 *
 * Public endpoint to fetch user profile data by user ID.
 * No authentication required - uses public RLS policy.
 *
 * @param request - Next.js request object
 * @param params - Route parameters containing userId
 * @returns JSON response with profile data or error
 */
export async function GET(request: NextRequest, context: {params: Promise<{userId: string}>}) {
  try {
    const {userId} = await context.params;

    // Validate numeric user ID format (only digits)
    if (!/^[0-9]+$/.test(userId)) {
      console.log(`Invalid numeric user ID format provided: ${userId}`);
      return NextResponse.json({success: false, error: "Invalid user ID format"}, {status: 400});
    }

    const numericUserId = parseInt(userId, 10);

    // Create Supabase client for public access (no auth required)
    const supabase = await createClient();

    // Fetch public profile data - only safe fields
    const {data: profile, error} = await supabase
      .from("profiles")
      .select("id, display_name, bio, photo, created_at, numeric_user_id, twitter_url, instagram_url, facebook_url, youtube_url, tiktok_url, website_url")
      .eq("numeric_user_id", numericUserId)
      .single();

    if (error) {
      // Log error for debugging but don't expose details
      console.error("Database error fetching profile:", error);

      // Check if it's a "not found" error
      if (error.code === "PGRST116") {
        return NextResponse.json({success: false, error: "User not found"}, {status: 404});
      }

      // Generic database error
      return NextResponse.json({success: false, error: "User not found"}, {status: 404});
    }

    if (!profile) {
      console.log(`Profile not found for user ID: ${userId}`);
      return NextResponse.json({success: false, error: "User not found"}, {status: 404});
    }

    // Success response with profile data
    // Add cache control headers to prevent stale data
    return NextResponse.json(
      {
        success: true,
        data: profile,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    // Log unexpected errors
    console.error("Unexpected error in profile API:", error);

    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}
