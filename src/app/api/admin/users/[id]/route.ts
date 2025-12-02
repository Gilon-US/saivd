import {NextRequest, NextResponse} from "next/server";
import {requireAdminUser} from "@/utils/admin";

function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// GET /api/admin/users/[id]
export async function GET(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;

    if (!isValidUUID(id)) {
      return NextResponse.json({success: false, error: "Invalid user ID format"}, {status: 400});
    }

    const {supabase, error} = await requireAdminUser();
    if (error) {
      return NextResponse.json({success: false, error: error.message}, {status: error.status});
    }

    const {data: profile, error: fetchError} = await supabase
      .from("profiles")
      .select(
        `
        id,
        numeric_user_id,
        email,
        display_name,
        avatar_url,
        twitter_url,
        instagram_url,
        facebook_url,
        youtube_url,
        tiktok_url,
        website_url,
        role
      `
      )
      .eq("id", id)
      .single();

    if (fetchError || !profile) {
      return NextResponse.json({success: false, error: "User not found"}, {status: 404});
    }

    return NextResponse.json({success: true, data: profile});
  } catch (err) {
    console.error("Unexpected error in GET /api/admin/users/[id]:", err);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}

// PUT /api/admin/users/[id]
export async function PUT(request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;

    if (!isValidUUID(id)) {
      return NextResponse.json({success: false, error: "Invalid user ID format"}, {status: 400});
    }

    const body = await request.json();
    const {display_name, avatar_url, twitter_url, instagram_url, facebook_url, youtube_url, tiktok_url, website_url} =
      body;

    if (display_name && (typeof display_name !== "string" || display_name.length < 2 || display_name.length > 50)) {
      return NextResponse.json(
        {success: false, error: "Display name must be between 2 and 50 characters"},
        {status: 400}
      );
    }

    const urlFields: Record<string, unknown> = {
      avatar_url,
      twitter_url,
      instagram_url,
      facebook_url,
      youtube_url,
      tiktok_url,
      website_url,
    };

    const updatePayload: Record<string, unknown> = {};

    // Helper to validate and assign URL-like fields when present
    const urlRegex = /^(https?:\/\/)[^\s]+$/i;
    for (const [key, value] of Object.entries(urlFields)) {
      if (value === undefined) continue;
      if (value === null || value === "") {
        updatePayload[key] = null;
        continue;
      }
      if (typeof value !== "string" || value.length > 2048 || !urlRegex.test(value)) {
        return NextResponse.json({success: false, error: `Invalid URL for ${key}`}, {status: 400});
      }
      updatePayload[key] = value;
    }

    if (display_name !== undefined) {
      updatePayload.display_name = display_name;
    }

    updatePayload.updated_at = new Date().toISOString();

    const {supabase, error} = await requireAdminUser();
    if (error) {
      return NextResponse.json({success: false, error: error.message}, {status: error.status});
    }

    const {data: profile, error: updateError} = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", id)
      .select(
        `
        id,
        numeric_user_id,
        email,
        display_name,
        avatar_url,
        twitter_url,
        instagram_url,
        facebook_url,
        youtube_url,
        tiktok_url,
        website_url,
        role,
        updated_at
      `
      )
      .single();

    if (updateError || !profile) {
      console.error("Error updating profile via admin:", updateError);
      return NextResponse.json({success: false, error: "Failed to update profile"}, {status: 500});
    }

    return NextResponse.json({success: true, data: profile});
  } catch (err) {
    console.error("Unexpected error in PUT /api/admin/users/[id]:", err);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}
