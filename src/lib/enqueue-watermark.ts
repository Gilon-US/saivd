import {generateKeyPairSync} from "crypto";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {WASABI_BUCKET} from "@/lib/wasabi";

type EnqueueResult =
  | {success: true; jobId: string | null}
  | {success: false; code: string; message: string};

type WatermarkAsyncResponse = {
  status: string;
  message?: string;
  path?: string;
  jobId?: string;
  jobID?: string[] | number[];
};

export async function enqueueWatermarkForVideo(videoId: string): Promise<EnqueueResult> {
  if (!videoId || typeof videoId !== "string" || !videoId.trim()) {
    return {
      success: false,
      code: "validation_error",
      message: "Video ID is required",
    };
  }

  const watermarkServiceUrl = process.env.WATERMARK_SERVICE_URL;
  if (!watermarkServiceUrl) {
    return {
      success: false,
      code: "config_error",
      message: "WATERMARK_SERVICE_URL is not configured on the server",
    };
  }

  const supabase = createServiceRoleClient();

  const {data: video, error: videoError} = await supabase
    .from("videos")
    .select("id, user_id, original_url, normalized_url, processed_url, status")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    console.error("[enqueueWatermark] Video not found", {videoId, videoError});
    return {
      success: false,
      code: "not_found",
      message: "Video not found",
    };
  }

  const {data: profile, error: profileError} = await supabase
    .from("profiles")
    .select("id, rsa_private, numeric_user_id")
    .eq("id", video.user_id)
    .single();

  if (profileError || !profile || profile.numeric_user_id == null) {
    console.error("[enqueueWatermark] Missing profile or numeric_user_id", {
      userId: video.user_id,
      profileError,
    });
    return {
      success: false,
      code: "missing_profile_data",
      message: "User profile is missing required numeric user ID",
    };
  }

  let rsaPrivate = profile.rsa_private as string | null;

  // Lazily generate RSA keys if missing (e.g., profile was created only by DB trigger)
  if (!rsaPrivate) {
    console.log("[enqueueWatermark] Generating RSA keys for profile", {userId: profile.id});

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
      .eq("id", profile.id);

    if (updateError) {
      console.error("[enqueueWatermark] Failed to persist RSA keys", {
        userId: profile.id,
        updateError,
      });
      return {
        success: false,
        code: "rsa_generation_error",
        message: "Failed to generate RSA keys for user profile",
      };
    }

    rsaPrivate = privateKey;
  }

  // Use normalized asset when available for stable Y-channel; else original upload
  const inputLocation = (video.normalized_url as string | null) ?? (video.original_url as string | null);

  if (!inputLocation) {
    console.error("[enqueueWatermark] Video missing inputLocation", {
      videoId: video.id,
      original_url: video.original_url,
      normalized_url: video.normalized_url,
    });
    return {
      success: false,
      code: "missing_video_location",
      message: "Video is missing source location for watermarking",
    };
  }

  // Derive an output key for the watermarked version (simple suffix before extension)
  const outputLocation = inputLocation.replace(/(\.[^./]+)$/, "-watermarked$1");

  // Watermark API requires the profile's numeric_user_id (integer), never the auth user.id (UUID) or video.user_id.
  const numericUserIdForApi = Number(profile.numeric_user_id);
  if (!Number.isInteger(numericUserIdForApi)) {
    console.error("[enqueueWatermark] profile.numeric_user_id is not a valid integer", {
      numeric_user_id: profile.numeric_user_id,
      type: typeof profile.numeric_user_id,
    });
    return {
      success: false,
      code: "missing_profile_data",
      message: "User profile has invalid numeric user ID",
    };
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const callbackUrl =
    process.env.WATERMARK_CALLBACK_URL || (appUrl ? `${appUrl}/api/webhooks/watermark-complete` : "");
  const callbackHmacSecret = process.env.WATERMARK_CALLBACK_HMAC_SECRET;

  if (!callbackUrl || !callbackUrl.startsWith("http")) {
    console.error("[enqueueWatermark] Callback URL not configured", {
      hasWatermarkCallbackUrl: !!process.env.WATERMARK_CALLBACK_URL,
      hasAppUrl: !!appUrl,
    });
    return {
      success: false,
      code: "config_error",
      message:
        "WATERMARK_CALLBACK_URL or NEXT_PUBLIC_APP_URL must be set to a public URL for callback delivery",
    };
  }

  if (!callbackHmacSecret) {
    return {
      success: false,
      code: "config_error",
      message: "WATERMARK_CALLBACK_HMAC_SECRET is required for watermark callbacks",
    };
  }

  const requestBody: Record<string, unknown> = {
    video_id: video.id.trim(),
    input_location: inputLocation,
    output_location: outputLocation,
    client_key: rsaPrivate,
    user_id: numericUserIdForApi,
    bucket: WASABI_BUCKET,
    async_request: true,
    stream: true,
    callback_url: callbackUrl,
    callback_hmac_secret: callbackHmacSecret,
  };

  const timeoutMsEnv = process.env.WATERMARK_TIMEOUT_MS;
  const timeoutMs =
    Number.isFinite(Number(timeoutMsEnv)) && Number(timeoutMsEnv) > 0 ? Number(timeoutMsEnv) : 5 * 60 * 1000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(watermarkServiceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Connection: "close",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[enqueueWatermark] External service request timed out", {
        watermarkServiceUrl,
        timeoutMs,
      });
      return {
        success: false,
        code: "watermark_timeout",
        message: "Watermark service request timed out",
      };
    }
    console.error("[enqueueWatermark] External service request failed", {error});
    return {
      success: false,
      code: "watermark_error",
      message: "Failed to reach watermark service",
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await response.text();

  let payload: WatermarkAsyncResponse | null = null;
  try {
    payload = rawText ? (JSON.parse(rawText) as WatermarkAsyncResponse) : null;
  } catch (e) {
    console.error("[enqueueWatermark] Failed to parse JSON from external service", e);
    console.log("[enqueueWatermark] External API start response (raw)", {
      status: response.status,
      rawBody: rawText?.slice(0, 500),
    });
    return {
      success: false,
      code: "watermark_error",
      message: "Watermark service returned an invalid response",
    };
  }

  console.log("[enqueueWatermark] External API start response", {status: response.status, payload});

  if (response.status === 400) {
    const detail = (payload as {detail?: string} | null)?.detail ?? rawText ?? "";
    const isVideoIdRequired = typeof detail === "string" && detail.toLowerCase().includes("video_id");
    return {
      success: false,
      code: isVideoIdRequired ? "video_id_required" : "watermark_error",
      message:
        typeof detail === "string"
          ? detail
          : isVideoIdRequired
            ? "Video identifier is required for the watermarking service"
            : "The watermarking service rejected the request",
    };
  }

  if (!response.ok || !payload || payload.status !== "processing" || !payload.path) {
    console.error("[enqueueWatermark] Service rejected or invalid response", {
      status: response.status,
      payload,
    });
    return {
      success: false,
      code: "watermark_error",
      message: payload?.message || "Failed to enqueue watermarked video job",
    };
  }

  const {error: updateError, data: updatedVideo} = await supabase
    .from("videos")
    .update({
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", video.id)
    .select("id, status")
    .single();

  if (updateError || !updatedVideo) {
    console.error("[enqueueWatermark] Failed to update video status to processing", {
      videoId: video.id,
      updateError,
    });
    return {
      success: false,
      code: "database_error",
      message: "Failed to update video status to processing",
    };
  }

  const jobId =
    payload.jobId != null
      ? String(payload.jobId)
      : Array.isArray(payload.jobID) && payload.jobID.length > 0
        ? String(payload.jobID[0])
        : null;

  console.log("[enqueueWatermark] Job enqueued", {
    videoId: video.id,
    outputPath: payload.path,
    jobId: jobId ?? "(none)",
    callbackUrl,
    numericUserIdLast4: String(numericUserIdForApi).slice(-4),
  });

  return {
    success: true,
    jobId,
  };
}

