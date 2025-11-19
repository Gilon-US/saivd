import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";

// POST /api/videos/[id]/watermark
// Creates a watermarked version of the video by calling the external watermark service.
export async function POST(_request: NextRequest, context: {params: {id: string}}) {
  try {
    const videoId = context.params.id;

    if (!videoId) {
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Missing video ID"}},
        {status: 400}
      );
    }

    const watermarkServiceUrl = process.env.WATERMARK_SERVICE_URL;
    if (!watermarkServiceUrl) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "config_error",
            message: "WATERMARK_SERVICE_URL is not configured on the server",
          },
        },
        {status: 500}
      );
    }

    // Authenticated user
    const supabase = await createClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {success: false, error: {code: "unauthorized", message: "Authentication required"}},
        {status: 401}
      );
    }

    // Load video and ensure it belongs to the user
    const {data: video, error: videoError} = await supabase
      .from("videos")
      .select("id, user_id, original_url, original_thumbnail_url, processed_url, processed_thumbnail_url, status")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) {
      console.error("Watermark: video not found or not owned by user", videoError);
      return NextResponse.json({success: false, error: {code: "not_found", message: "Video not found"}}, {status: 404});
    }

    // Load user profile to get RSA private key
    const {data: profile, error: profileError} = await supabase
      .from("profiles")
      .select("id, rsa_private, numeric_user_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || !profile.rsa_private || profile.numeric_user_id == null) {
      console.error("Watermark: missing RSA private key for user", profileError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "missing_profile_data",
            message: "User profile is missing required RSA key or numeric user ID",
          },
        },
        {status: 400}
      );
    }

    const inputLocation = video.original_url; // stored Wasabi/S3 key

    // Derive an output key for the watermarked version (simple suffix before extension)
    const outputLocation = inputLocation.replace(/(\.[^./]+)$/, "-watermarked$1");

    const requestBody = {
      input_location: inputLocation,
      output_location: outputLocation,
      local_key: profile.rsa_private,
      client_key: profile.rsa_private,
      user_id: profile.numeric_user_id,
    };

    // Call external watermark service
    const response = await fetch(watermarkServiceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch (e) {
      console.error("Watermark service returned non-JSON response", e);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "watermark_error",
            message: "Watermark service returned an invalid response",
          },
        },
        {status: 502}
      );
    }

    if (!response.ok || !payload || payload.status !== "success" || !payload.path) {
      console.error("Watermark service error", {status: response.status, payload});
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "watermark_error",
            message: payload?.message || "Failed to create watermarked video",
          },
        },
        {status: 502}
      );
    }

    const watermarkedKey = payload.path as string;

    // For now, reuse the original thumbnail for the watermarked version so the dashboard
    // can display a preview immediately. This can be replaced with a dedicated
    // watermarked thumbnail generation flow later.
    const processedThumbnailUrl = video.original_thumbnail_url ?? null;

    const {data: updatedVideo, error: updateError} = await supabase
      .from("videos")
      .update({
        processed_url: watermarkedKey,
        processed_thumbnail_url: processedThumbnailUrl,
        status: "processed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (updateError || !updatedVideo) {
      console.error("Error updating video with watermarked data", updateError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "database_error",
            message: "Failed to update video with watermarked version",
          },
        },
        {status: 500}
      );
    }

    return NextResponse.json({success: true, data: updatedVideo});
  } catch (error) {
    console.error("Unexpected error in POST /api/videos/[id]/watermark:", error);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}
