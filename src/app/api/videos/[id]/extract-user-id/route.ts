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
    // Include the full S3 key path with file extension
    let videoKey = video.processed_url;
    
    // If it's a URL, extract the key
    if (videoKey.startsWith("http")) {
      const urlObj = new URL(videoKey);
      videoKey = urlObj.pathname.substring(1); // Remove leading "/"
    }

    // Use the full video key path including the file extension
    const videoName = videoKey;

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
    // According to API docs: POST /extract_user_id
    // Request body: { video_name: string, frame_index?: number, bucket?: string }
    // video_name can be just the filename (without .mp4 extension) or full S3 key path
    const extractUrl = `${watermarkServiceUrl.replace(/\/+$/, "")}/extract_user_id`;

    const requestBody = {
      video_name: videoName,
      frame_index: frameIndex,
      bucket: WASABI_BUCKET,
    };

    const requestHeaders = {
      "Content-Type": "application/json",
    };

    console.log("[ExtractUserId] Full request:", {
      url: extractUrl,
      method: "POST",
      headers: requestHeaders,
      body: requestBody,
      bodyRaw: JSON.stringify(requestBody),
    });

    const response = await fetch(extractUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

    const rawText = await response.text();
    console.log("[ExtractUserId] Full response:", {
      url: extractUrl,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: rawText,
      bodyLength: rawText?.length ?? 0,
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
      console.log("[ExtractUserId] Parsed payload:", JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error("[ExtractUserId] Failed to parse JSON from watermark service", e, {rawText});
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

    if (!payload || !payload.success) {
      console.error("[ExtractUserId] Invalid payload structure or unsuccessful response", {
        hasPayload: !!payload,
        success: payload?.success,
        error: payload?.error,
        payloadStructure: payload,
      });
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

    if (!payload.user_id) {
      console.error("[ExtractUserId] Missing user_id in response", {
        payloadStructure: payload,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "extraction_failed",
            message: "User ID not found in response",
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
        video_name: payload.video_name ?? videoName,
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

