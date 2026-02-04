import {NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {generateKeyPairSync} from "crypto";
import {generateAndUploadUserQrCode} from "@/lib/qr-codes";

// GET /api/profile
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: {user},
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({success: false, error: "Authentication required"}, {status: 401});
    }

    // Try to get existing profile (includes RSA so we can lazily backfill if missing)
    const {data: profileWithKeys, error} = await supabase
      .from("profiles")
      .select(
        `
        id,
        email,
        display_name,
        avatar_url,
        photo,
        bio,
        numeric_user_id,
        twitter_url,
        instagram_url,
        facebook_url,
        youtube_url,
        tiktok_url,
        website_url,
        role,
        rsa_public,
        rsa_private,
        created_at,
        updated_at
      `
      )
      .eq("id", user.id)
      .single();

    if (error) {
      // If profile doesn't exist, create one
      if (error.code === "PGRST116") {
        console.log("Profile not found, creating new profile for user:", user.id);

        // Generate an RSA keypair for this user (backend-only, never exposed to UI)
        const {publicKey, privateKey} = generateKeyPairSync("rsa", {
          modulusLength: 2048,
          publicKeyEncoding: {type: "spki", format: "pem"},
          privateKeyEncoding: {type: "pkcs8", format: "pem"},
        });

        const insertPayload = {
          id: user.id,
          email: user.email || "",
          display_name: user.user_metadata?.display_name || user.email?.split("@")[0] || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          rsa_public: publicKey,
          rsa_private: privateKey,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const {error: createError} = await supabase.from("profiles").insert(insertPayload);

        if (createError) {
          console.error("Error creating profile:", createError);
          return NextResponse.json({success: false, error: "Failed to create profile"}, {status: 500});
        }

        // Re-fetch the profile with the same safe selection as above (no RSA fields)
        const {data: createdProfileWithKeys, error: fetchCreatedError} = await supabase
          .from("profiles")
          .select(
            `
            id,
            email,
            display_name,
            avatar_url,
            photo,
            bio,
            numeric_user_id,
            twitter_url,
            instagram_url,
            facebook_url,
            youtube_url,
            tiktok_url,
            website_url,
            role,
            rsa_public,
            rsa_private,
            created_at,
            updated_at
          `
          )
          .eq("id", user.id)
          .single();

        if (fetchCreatedError || !createdProfileWithKeys) {
          console.error("Error fetching newly created profile:", fetchCreatedError);
          return NextResponse.json({success: false, error: "Failed to create profile"}, {status: 500});
        }

        const {rsa_public, rsa_private, ...safeCreatedProfile} = createdProfileWithKeys;
        void rsa_public;
        void rsa_private;
        return NextResponse.json({success: true, data: safeCreatedProfile});
      }

      console.error("Error fetching profile:", error);
      return NextResponse.json({success: false, error: "Failed to fetch profile"}, {status: 500});
    }

    // If profile exists but is missing RSA keys (e.g., created only by DB trigger), backfill them lazily
    if (profileWithKeys && (!profileWithKeys.rsa_public || !profileWithKeys.rsa_private)) {
      console.log("Profile missing RSA keys, generating new keypair for user:", user.id);

      const {publicKey, privateKey} = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: {type: "spki", format: "pem"},
        privateKeyEncoding: {type: "pkcs8", format: "pem"},
      });

      const {error: updateError} = await supabase
        .from("profiles")
        .update({
          rsa_public: publicKey,
          rsa_private: privateKey,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error backfilling RSA keys for profile:", updateError);
        return NextResponse.json({success: false, error: "Failed to update profile"}, {status: 500});
      }
    }

    // Ensure QR code exists for this user if numeric_user_id is set
    if (profileWithKeys?.numeric_user_id != null) {
      try {
        await generateAndUploadUserQrCode(profileWithKeys.numeric_user_id);
      } catch (qrError) {
        console.error("Error generating QR code for profile:", qrError);
        // Do not fail the profile request if QR generation fails
      }
    }

    // Strip RSA fields before returning to client
    const {rsa_public, rsa_private, ...safeProfile} = profileWithKeys || {};
    void rsa_public;
    void rsa_private;

    return NextResponse.json({success: true, data: safeProfile});
  } catch (error) {
    console.error("Unexpected error in GET /api/profile:", error);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}

// Optional URL validator: if present and non-empty, must be a valid URL
function isValidUrlOrEmpty(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (typeof value !== "string") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// PUT /api/profile
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: {user},
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({success: false, error: "Authentication required"}, {status: 401});
    }

    const body = await request.json();
    const {
      display_name,
      bio,
      photo,
      avatar_url,
      twitter_url,
      instagram_url,
      facebook_url,
      youtube_url,
      tiktok_url,
      website_url,
    } = body;

    if (display_name !== undefined) {
      const trimmed = typeof display_name === "string" ? display_name.trim() : "";
      if (trimmed.length < 2) {
        return NextResponse.json(
          {success: false, error: "Display name must be at least 2 characters"},
          {status: 400}
        );
      }
      if (trimmed.length > 100) {
        return NextResponse.json(
          {success: false, error: "Display name cannot exceed 100 characters"},
          {status: 400}
        );
      }
    }

    if (bio !== undefined && bio != null && String(bio).length > 500) {
      return NextResponse.json(
        {success: false, error: "Bio cannot exceed 500 characters"},
        {status: 400}
      );
    }

    const urlFields = [
      {key: "photo", value: photo},
      {key: "avatar_url", value: avatar_url},
      {key: "twitter_url", value: twitter_url},
      {key: "instagram_url", value: instagram_url},
      {key: "facebook_url", value: facebook_url},
      {key: "youtube_url", value: youtube_url},
      {key: "tiktok_url", value: tiktok_url},
      {key: "website_url", value: website_url},
    ];
    for (const {key, value} of urlFields) {
      if (!isValidUrlOrEmpty(value)) {
        return NextResponse.json(
          {success: false, error: `${key.replace(/_/g, " ")} must be a valid URL or empty`},
          {status: 400}
        );
      }
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (display_name !== undefined) updatePayload.display_name = String(display_name).trim();
    if (bio !== undefined) updatePayload.bio = bio == null ? null : String(bio).trim() || null;
    if (photo !== undefined) updatePayload.photo = photo == null ? null : String(photo).trim() || null;
    if (avatar_url !== undefined) updatePayload.avatar_url = avatar_url == null ? null : String(avatar_url).trim() || null;
    if (twitter_url !== undefined) updatePayload.twitter_url = twitter_url == null ? null : String(twitter_url).trim() || null;
    if (instagram_url !== undefined) updatePayload.instagram_url = instagram_url == null ? null : String(instagram_url).trim() || null;
    if (facebook_url !== undefined) updatePayload.facebook_url = facebook_url == null ? null : String(facebook_url).trim() || null;
    if (youtube_url !== undefined) updatePayload.youtube_url = youtube_url == null ? null : String(youtube_url).trim() || null;
    if (tiktok_url !== undefined) updatePayload.tiktok_url = tiktok_url == null ? null : String(tiktok_url).trim() || null;
    if (website_url !== undefined) updatePayload.website_url = website_url == null ? null : String(website_url).trim() || null;

    const {data: profile, error} = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", user.id)
      .select(
        "id, email, display_name, avatar_url, photo, bio, numeric_user_id, twitter_url, instagram_url, facebook_url, youtube_url, tiktok_url, website_url, role, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("Error updating profile:", error);
      return NextResponse.json({success: false, error: "Failed to update profile"}, {status: 500});
    }

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Unexpected error in PUT /api/profile:", error);
    return NextResponse.json({success: false, error: "Server error"}, {status: 500});
  }
}
