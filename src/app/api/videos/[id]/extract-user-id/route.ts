import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {WASABI_BUCKET} from "@/lib/wasabi";

type ExtractUserIdResponse = {
  success: boolean;
  user_id?: string;
  frame_index?: number;
  video_name?: string;
  error?: string;
};

/**
 * GET /api/videos/[id]/extract-user-id
 * Extracts user ID from a specific frame of a watermarked video.
 * 
 * Query parameters:
 * - frame_index: Frame index to analyze (default: 0)
 * 
 * Returns the user ID extracted from the video frame.
 */
export async function GET(request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: videoId} = await context.params;

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

    // Get authenticated user
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
      .select("id, user_id, processed_url")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) {
      console.error("[ExtractUserId] Video not found or not owned by user", videoError);
      return NextResponse.json(
        {success: false, error: {code: "not_found", message: "Video not found"}},
        {status: 404}
      );
    }

    // Get the processed (watermarked) URL - this is required for extraction
    if (!video.processed_url) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "missing_watermarked_video",
            message: "Watermarked video not available. Please create a watermarked version first.",
          },
        },
        {status: 400}
      );
    }

    // Get the full S3 key path for the processed (watermarked) video
    // The API needs the full S3 path, not just the filename
    let videoKey = video.processed_url;
    
    // If it's a URL, extract the key
    if (videoKey.startsWith("http")) {
      const urlObj = new URL(videoKey);
      videoKey = urlObj.pathname.substring(1); // Remove leading "/"
    }

    // The API error message suggests it constructs paths as "videos/{video_name}.mp4"
    // But our files are stored at "uploads/{userId}/{uuid}-watermarked.mp4"
    // Based on the watermark API which uses full paths, we should pass the full S3 key path
    // Format: "s3://bucket/key" or just the full key path
    // Let's pass the full key path (without extension) as the API might construct the full path
    const videoKeyWithoutExtension = videoKey.replace(/\.(mp4|mov|avi|webm)$/i, "");
    
    // Construct the full S3 path format that the API might expect
    // The API might need: "s3://bucket/key" or just the full key path
    // Based on the error, it seems the API looks in a "videos/" directory, but our files are in "uploads/"
    // Let's pass the full key path and see if the API can handle it
    const s3Path = `s3://${WASABI_BUCKET}/${videoKey}`;
    const videoNameForApi = videoKeyWithoutExtension; // Full key path without extension

    // Get frame_index from query params (default to 0)
    const url = new URL(request.url);
    const frameIndexParam = url.searchParams.get("frame_index");
    const frameIndex = frameIndexParam ? parseInt(frameIndexParam, 10) : 0;

    if (isNaN(frameIndex) || frameIndex < 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "validation_error",
            message: "Invalid frame_index parameter",
          },
        },
        {status: 400}
      );
    }

    // Call watermark service extract_user_id endpoint
    const extractUrl = `${watermarkServiceUrl.replace(/\/+$/, "")}/extract_user_id`;

    // Try passing the full S3 path format first, if that doesn't work, we'll try just the key
    // The API documentation says video_name should be without extension
    // But the error suggests it might need the full path or S3 URL format
    const requestBody = {
      video_name: videoNameForApi,
      frame_index: frameIndex,
      // Include bucket and full path if the API supports it
      // Some APIs accept additional parameters even if not documented
      bucket: WASABI_BUCKET,
      video_path: videoKey, // Full key with extension
    };

    console.log("[ExtractUserId] Calling watermark service", {
      url: extractUrl,
      body: requestBody,
      s3Path,
      videoKey,
    });

    const response = await fetch(extractUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const rawText = await response.text();
    console.log("[ExtractUserId] Received response from watermark service", {
      status: response.status,
      statusText: response.statusText,
      body: rawText,
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "watermark_service_error",
            message: "Failed to extract user ID from video frame",
          },
        },
        {status: 502}
      );
    }

    let payload: ExtractUserIdResponse | null = null;
    try {
      payload = rawText ? (JSON.parse(rawText) as ExtractUserIdResponse) : null;
    } catch (e) {
      console.error("[ExtractUserId] Failed to parse JSON from watermark service", e);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "parse_error",
            message: "Watermark service returned an invalid response",
          },
        },
        {status: 502}
      );
    }

    if (!payload || !payload.success || !payload.user_id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "extraction_failed",
            message: payload?.error || "Failed to extract user ID from video frame",
          },
        },
        {status: 502}
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user_id: payload.user_id,
        frame_index: payload.frame_index ?? frameIndex,
        video_name: payload.video_name ?? videoKeyWithoutExtension,
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/videos/[id]/extract-user-id:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Server error"}},
      {status: 500}
    );
  }
}

