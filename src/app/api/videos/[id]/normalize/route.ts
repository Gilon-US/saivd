import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { WASABI_BUCKET } from "@/lib/wasabi";

/**
 * POST /api/videos/[id]/normalize
 *
 * Starts normalization of the uploaded video (convert to standard MP4 for streaming
 * and stable Y-channel decoding). Calls external normalize_video endpoint with
 * callback URL; the callback updates normalized_url and normalization_status.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await context.params;
    const requestId = `norm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!videoId || typeof videoId !== "string" || !videoId.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "validation_error",
            message: "Video ID is required",
          },
        },
        { status: 400 }
      );
    }

    const normalizeServiceUrl =
      process.env.WATERMARK_API_URL ?? process.env.WATERMARK_SERVICE_URL;
    const normalizeServiceSource = process.env.WATERMARK_API_URL
      ? "WATERMARK_API_URL"
      : "WATERMARK_SERVICE_URL";
    if (!normalizeServiceUrl) {
      console.error("[Normalize] Missing normalize service URL", {
        requestId,
        videoId,
        hasWatermarkApiUrl: Boolean(process.env.WATERMARK_API_URL),
        hasWatermarkServiceUrl: Boolean(process.env.WATERMARK_SERVICE_URL),
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "config_error",
            message:
              "WATERMARK_SERVICE_URL or WATERMARK_API_URL is not configured on the server",
          },
        },
        { status: 500 }
      );
    }

    const callbackSecret = process.env.NORMALIZE_CALLBACK_HMAC_SECRET;
    if (!callbackSecret) {
      console.error("[Normalize] Missing callback HMAC secret", {
        requestId,
        videoId,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "config_error",
            message: "NORMALIZE_CALLBACK_HMAC_SECRET is required for normalize callbacks",
          },
        },
        { status: 500 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn("[Normalize] Unauthorized normalize request", {
        requestId,
        videoId,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: "unauthorized", message: "Authentication required" },
        },
        { status: 401 }
      );
    }

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, user_id, original_url")
      .eq("id", videoId.trim())
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) {
      console.error("[Normalize] Video not found or not owned by user", {
        requestId,
        videoId,
        userId: user.id,
        videoError,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: "not_found", message: "Video not found" },
        },
        { status: 404 }
      );
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    if (!appUrl || !appUrl.startsWith("http")) {
      console.error("[Normalize] Invalid app URL configuration", {
        requestId,
        videoId,
        appUrlPresent: Boolean(appUrl),
        appUrlStartsWithHttp: appUrl.startsWith("http"),
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "config_error",
            message:
              "NEXT_PUBLIC_APP_URL must be set to a public URL for normalize callback",
          },
        },
        { status: 500 }
      );
    }

    const callbackUrl = `${appUrl}/api/webhooks/normalize?videoId=${encodeURIComponent(videoId.trim())}`;
    console.log("[Normalize] Starting normalize flow", {
      requestId,
      videoId: video.id,
      userId: user.id,
      normalizeServiceSource,
      normalizeServiceBase: normalizeServiceUrl.replace(/\/+$/, ""),
      callbackHost: new URL(callbackUrl).host,
      hasCallbackSecret: Boolean(callbackSecret),
    });

    // Mark normalization as in progress so UI/watermark can see it was started
    await supabase
      .from("videos")
      .update({
        normalization_status: "normalizing",
        normalization_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", video.id)
      .eq("user_id", user.id);
    console.log("[Normalize] Marked video as normalizing", {
      requestId,
      videoId: video.id,
      userId: user.id,
    });

    const body = {
      input_location: video.original_url,
      bucket: WASABI_BUCKET,
      callback_url: callbackUrl,
      callback_hmac_secret: callbackSecret,
    };

    const baseUrl = normalizeServiceUrl.replace(/\/+$/, "");
    const normalizeEndpoint = `${baseUrl}/normalize_video`;
    console.log("[Normalize] Calling manager normalize endpoint", {
      requestId,
      videoId: video.id,
      endpoint: normalizeEndpoint,
      inputLocationPresent: Boolean(video.original_url),
      bucket: WASABI_BUCKET,
    });

    let response: Response;
    try {
      response = await fetch(normalizeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error("[Normalize] Failed to call normalize service", {
        requestId,
        videoId,
        userId: user.id,
        endpoint: normalizeEndpoint,
        error: err,
      });
      await supabase
        .from("videos")
        .update({
          normalization_status: "failed",
          normalization_message: "Failed to start normalization",
          updated_at: new Date().toISOString(),
        })
        .eq("id", video.id)
        .eq("user_id", user.id);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "normalize_error",
            message: "Failed to reach normalization service",
          },
        },
        { status: 502 }
      );
    }

    const rawText = await response.text();
    let payload: { status?: string; detail?: string; message?: string; output_location?: string } | null = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      // non-JSON response
    }

    if (!response.ok) {
      const message =
        payload?.detail ?? payload?.message ?? response.statusText;
      console.error("[Normalize] Service error", {
        requestId,
        videoId,
        userId: user.id,
        endpoint: normalizeEndpoint,
        status: response.status,
        message,
      });
      await supabase
        .from("videos")
        .update({
          normalization_status: "failed",
          normalization_message: message || "Normalization failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", video.id)
        .eq("user_id", user.id);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "normalize_error",
            message: message || "Normalization service returned an error",
          },
        },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    console.log("[Normalize] Normalize request accepted by manager", {
      requestId,
      videoId: video.id,
      userId: user.id,
      endpoint: normalizeEndpoint,
      managerStatusCode: response.status,
      managerPayloadStatus: payload?.status ?? null,
      hasOutputLocation: Boolean(payload?.output_location),
    });
    return NextResponse.json({
      success: true,
      data: {
        status: payload?.status ?? "processing",
        output_location: payload?.output_location ?? null,
      },
    });
  } catch (error) {
    console.error("[Normalize] Unexpected error", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "server_error", message: "Server error" },
      },
      { status: 500 }
    );
  }
}
