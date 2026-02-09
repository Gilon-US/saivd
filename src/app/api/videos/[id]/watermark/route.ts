import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {generateKeyPairSync} from "crypto";
import {WASABI_BUCKET} from "@/lib/wasabi";

type WatermarkAsyncResponse = {
  status: string;
  message?: string;
  path?: string;
};

export function normalizeWatermarkPath(path: string): string {
  const match = path.match(/^s3:\/\/[^/]+\/(.+)$/);
  if (!match) return path;
  return match[1];
}

// POST /api/videos/[id]/watermark
// Creates a watermarked version of the video by calling the external watermark service.
export async function POST(_request: NextRequest, context: {params: Promise<{id: string}>}) {
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

    // Load user profile to get RSA private key and numeric user ID
    const {data: profile, error: profileError} = await supabase
      .from("profiles")
      .select("id, rsa_private, numeric_user_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.numeric_user_id == null) {
      console.error("Watermark: missing profile or numeric_user_id for user", profileError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "missing_profile_data",
            message: "User profile is missing required numeric user ID",
          },
        },
        {status: 400}
      );
    }

    let rsaPrivate = profile.rsa_private as string | null;

    // Lazily generate RSA keys if missing (e.g., profile was created only by DB trigger)
    if (!rsaPrivate) {
      console.log("Watermark: profile missing RSA keys, generating new keypair for user:", user.id);

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
        console.error("Watermark: error backfilling RSA keys for profile", updateError);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "rsa_generation_error",
              message: "Failed to generate RSA keys for user profile",
            },
          },
          {status: 500}
        );
      }

      rsaPrivate = privateKey;
    }

    const inputLocation = video.original_url; // stored Wasabi/S3 key

    // Derive an output key for the watermarked version (simple suffix before extension)
    const outputLocation = inputLocation.replace(/(\.[^./]+)$/, "-watermarked$1");

    // Watermark API requires the profile's numeric_user_id (integer), never the auth user.id (UUID) or video.user_id.
    const numericUserIdForApi = Number(profile.numeric_user_id);
    if (!Number.isInteger(numericUserIdForApi)) {
      console.error("[Watermark] profile.numeric_user_id is not a valid integer", {
        numeric_user_id: profile.numeric_user_id,
        type: typeof profile.numeric_user_id,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "missing_profile_data",
            message: "User profile has invalid numeric user ID",
          },
        },
        {status: 400}
      );
    }

    const requestBody = {
      input_location: inputLocation,
      output_location: outputLocation,
      client_key: rsaPrivate,
      // Must be profile.numeric_user_id (integer), not user.id or video.user_id (UUID string).
      user_id: numericUserIdForApi,
      bucket: WASABI_BUCKET,
      async_request: true,
      stream: true,
    };

    console.log("[Watermark] Sending numeric_user_id to external service (last 4 digits)", {
      numericUserIdLast4: String(numericUserIdForApi).slice(-4),
    });

    // Call external watermark service (log payload with redacted keys)
    const safeLogBody = {
      ...requestBody,
      client_key: requestBody.client_key
        ? `[REDACTED_CLIENT_KEY:${(requestBody.client_key as string).length}chars]`
        : null,
    };

    console.log(`[Watermark] Sending request to external service - URL: ${watermarkServiceUrl}`);
    console.log("[Watermark] External service request details", {
      url: watermarkServiceUrl,
      body: safeLogBody,
      numericUserId: numericUserIdForApi,
      numericUserIdLast4: String(numericUserIdForApi).slice(-4),
      method: "POST",
    });

    const timeoutMsEnv = process.env.WATERMARK_TIMEOUT_MS;
    const timeoutMs =
      Number.isFinite(Number(timeoutMsEnv)) && Number(timeoutMsEnv) > 0 ? Number(timeoutMsEnv) : 5 * 60 * 1000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs); // 2 minutes

    let response: Response;
    try {
      response = await fetch(watermarkServiceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[Watermark] External service request timed out - URL: ${watermarkServiceUrl}`, {timeoutMs});
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "watermark_timeout",
              message: "Watermark service request timed out",
            },
          },
          {status: 504}
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    const rawText = await response.text();
    console.log(`[Watermark] Received response from external service - URL: ${watermarkServiceUrl}`);
    console.log("[Watermark] External service response details", {
      url: watermarkServiceUrl,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      bodyLength: rawText?.length || 0,
      body: rawText,
    });

    let payload: WatermarkAsyncResponse | null = null;
    try {
      payload = rawText ? (JSON.parse(rawText) as WatermarkAsyncResponse) : null;
    } catch (e) {
      console.error("[Watermark] Failed to parse JSON from external service", e);
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

    // In async mode the service responds with e.g.
    // {"status":"processing","message":"Check output at s3://bucket/key once processing is complete.","path":"s3://bucket/key"}
    // Treat HTTP 200 + status === "processing" + non-empty path as a successful enqueue.
    if (!response.ok || !payload || payload.status !== "processing" || !payload.path) {
      console.error("Watermark service error", {status: response.status, payload});
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "watermark_error",
            message: payload?.message || "Failed to enqueue watermarked video job",
          },
        },
        {status: 502}
      );
    }

    const {data: updatedVideo, error: updateError} = await supabase
      .from("videos")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (updateError || !updatedVideo) {
      console.error("Error updating video status to processing", updateError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "database_error",
            message: "Failed to update video status to processing",
          },
        },
        {status: 500}
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        video: updatedVideo,
        message: payload.message ?? null,
      },
    });
  } catch (error) {
    console.error("Unexpected error in POST /api/videos/[id]/watermark:", error);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}
