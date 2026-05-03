import {NextRequest, NextResponse} from "next/server";
import {requireAdminUser} from "@/utils/admin";
import {requireRole} from "@/utils/auth-roles";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {isBootstrapSuperuserEmail} from "@/lib/bootstrap-superuser";
import {writeAudit} from "@/utils/audit";

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

    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({success: false, error: "Authentication required"}, {status: 401});
    }

    const {data: beforeRow, error: beforeErr} = await supabase
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

    if (beforeErr || !beforeRow) {
      return NextResponse.json({success: false, error: "User not found"}, {status: 404});
    }

    const serviceClient = createServiceRoleClient();
    const {data: profile, error: updateError} = await serviceClient
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

    try {
      await writeAudit({
        actorId: user.id,
        action: "edit_user_profile",
        targetId: id,
        before: {
          display_name: beforeRow.display_name,
          avatar_url: beforeRow.avatar_url,
          twitter_url: beforeRow.twitter_url,
          instagram_url: beforeRow.instagram_url,
          facebook_url: beforeRow.facebook_url,
          youtube_url: beforeRow.youtube_url,
          tiktok_url: beforeRow.tiktok_url,
          website_url: beforeRow.website_url,
        },
        after: {
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          twitter_url: profile.twitter_url,
          instagram_url: profile.instagram_url,
          facebook_url: profile.facebook_url,
          youtube_url: profile.youtube_url,
          tiktok_url: profile.tiktok_url,
          website_url: profile.website_url,
        },
        request,
      });
    } catch (auditErr) {
      console.error("Audit log failed after profile update (profile was saved):", auditErr);
    }

    return NextResponse.json({success: true, data: profile});
  } catch (err) {
    console.error("Unexpected error in PUT /api/admin/users/[id]:", err);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}

// DELETE /api/admin/users/[id] — superuser only, hard-deletes auth user + profile (cascade)
export async function DELETE(request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;

    if (!isValidUUID(id)) {
      return NextResponse.json({success: false, error: "Invalid user ID format"}, {status: 400});
    }

    const {user, error} = await requireRole(["superuser"]);
    if (error) {
      return NextResponse.json({success: false, error: error.message}, {status: error.status});
    }

    if (id === user.id) {
      return NextResponse.json({success: false, error: "You cannot delete your own account"}, {status: 400});
    }

    const serviceClient = createServiceRoleClient();

    // Fetch target profile for audit + bootstrap guard
    const {data: targetProfile} = await serviceClient
      .from("profiles")
      .select("id, email, display_name, role")
      .eq("id", id)
      .single();

    if (!targetProfile) {
      return NextResponse.json({success: false, error: "User not found"}, {status: 404});
    }

    if (isBootstrapSuperuserEmail(targetProfile.email)) {
      return NextResponse.json({success: false, error: "Cannot delete the platform superuser"}, {status: 403});
    }

    // Delete auth user — profiles row is removed via ON DELETE CASCADE
    const {error: deleteError} = await serviceClient.auth.admin.deleteUser(id);
    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return NextResponse.json({success: false, error: "Failed to delete user"}, {status: 500});
    }

    try {
      await writeAudit({
        actorId: user.id,
        action: "delete_user",
        targetId: id,
        before: {email: targetProfile.email, display_name: targetProfile.display_name, role: targetProfile.role},
        after: null,
        request,
      });
    } catch (auditErr) {
      console.error("Audit log failed after user deletion (user was deleted):", auditErr);
    }

    return NextResponse.json({success: true});
  } catch (err) {
    console.error("Unexpected error in DELETE /api/admin/users/[id]:", err);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}
