/**
 * Image watermark client. Calls the saivd-backend manager's
 * POST /image/watermark route synchronously and returns the result.
 *
 * Mirrors the shape of src/lib/enqueue-watermark.ts (the video equivalent)
 * but takes the sync path because images embed in ~1-3 seconds and the
 * sync UX is simpler (no callback, no webhook, no polling).
 *
 * Used by /api/images/confirm to auto-trigger watermarking after upload.
 */
import {generateKeyPairSync} from "crypto";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {WASABI_BUCKET} from "@/lib/wasabi";

export type WatermarkImageErrorCode =
  | "validation_error"
  | "config_error"
  | "not_found"
  | "missing_profile_data"
  | "rsa_generation_error"
  | "watermark_timeout"
  | "watermark_error"
  | "image_too_extreme"
  | "database_error";

export type WatermarkImageResult =
  | {
      success: true;
      processedUrl: string; // S3 key under WASABI_BUCKET (no s3:// prefix)
      standardization: Record<string, unknown> | null;
      message: string;
    }
  | {
      success: false;
      code: WatermarkImageErrorCode;
      message: string;
    };

type BackendSyncResponse = {
  status: "completed" | "failed" | "processing";
  job_id: string | null;
  image_id: string;
  user_id: number;
  path: string | null;
  message: string;
  standardization: Record<string, unknown> | null;
};

function buildEndpoint(): string | null {
  const base = (process.env.WATERMARK_SERVICE_URL ?? "").replace(/\/+$/, "");
  if (!base) return null;
  // Endpoint discovery mirrors enqueue-watermark.ts: accept either the bare
  // manager URL or a URL that already includes the /image/watermark suffix.
  if (base.endsWith("/image/watermark")) return base;
  if (base.endsWith("/image")) return `${base}/watermark`;
  return `${base}/image/watermark`;
}

/**
 * Watermark an already-uploaded image. The image must already exist in
 * Wasabi at `inputLocation` (the key returned by /api/images/upload), and
 * a corresponding `public.images` row must already exist with the given
 * `imageId` (DB UUID) and user.
 *
 * On success, the backend writes the watermarked PNG to
 *   images/{numeric_user_id}/{imageId}/processed.png
 * under the same bucket. The caller is responsible for persisting
 * `processedUrl` and `status='processed'` (the helper does not touch the
 * `images` table).
 */
export async function watermarkImageSync(args: {
  imageId: string;
  userId: string; // Supabase auth.users.id (UUID)
  inputLocation: string; // Wasabi key of the uploaded original
}): Promise<WatermarkImageResult> {
  const {imageId, userId, inputLocation} = args;
  const requestId = `wmi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (!imageId?.trim() || !userId?.trim() || !inputLocation?.trim()) {
    return {success: false, code: "validation_error", message: "imageId, userId, and inputLocation are required"};
  }

  const endpoint = buildEndpoint();
  if (!endpoint) {
    console.error("[watermarkImage] WATERMARK_SERVICE_URL is not configured", {requestId});
    return {
      success: false,
      code: "config_error",
      message: "WATERMARK_SERVICE_URL is not configured on the server",
    };
  }

  const supabase = createServiceRoleClient();

  // Fetch the user's RSA private key and numeric_user_id from `profiles`.
  // Mirrors enqueue-watermark.ts:69-122 including lazy key generation.
  const {data: profile, error: profileError} = await supabase
    .from("profiles")
    .select("id, rsa_private, numeric_user_id")
    .eq("id", userId)
    .single();

  if (profileError || !profile || profile.numeric_user_id == null) {
    console.error("[watermarkImage] Missing profile or numeric_user_id", {requestId, userId, profileError});
    return {
      success: false,
      code: "missing_profile_data",
      message: "User profile is missing required numeric user ID",
    };
  }

  let rsaPrivate = profile.rsa_private as string | null;
  if (!rsaPrivate) {
    console.log("[watermarkImage] Generating RSA keys for profile", {userId: profile.id});
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
      console.error("[watermarkImage] Failed to persist RSA keys", {userId: profile.id, updateError});
      return {success: false, code: "rsa_generation_error", message: "Failed to generate RSA keys"};
    }
    rsaPrivate = privateKey;
  }

  const numericUserId = Number(profile.numeric_user_id);
  if (!Number.isInteger(numericUserId) || numericUserId < 0 || numericUserId > 999_999_999) {
    return {
      success: false,
      code: "missing_profile_data",
      message: "User profile has invalid numeric_user_id",
    };
  }

  // Sync image watermarking is typically 1-3s. The 30s timeout below leaves
  // headroom for big inputs (8K images, slow Wasabi reads). WATERMARK_TIMEOUT_MS
  // overrides if set.
  const timeoutMsEnv = process.env.WATERMARK_TIMEOUT_MS;
  const timeoutMs =
    Number.isFinite(Number(timeoutMsEnv)) && Number(timeoutMsEnv) > 0
      ? Number(timeoutMsEnv)
      : 30 * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody = {
    image_id: imageId,
    input_location: inputLocation,
    bucket: WASABI_BUCKET,
    client_key: rsaPrivate,
    user_id: numericUserId,
    output_format: "png" as const,
    async_request: false,
  };

  let response: Response;
  try {
    console.log("[watermarkImage] Dispatching sync request to manager", {
      requestId,
      endpoint,
      imageId,
      userId,
      inputLocation,
      numericUserIdLast4: String(numericUserId).slice(-4),
      timeoutMs,
    });
    response = await fetch(endpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json", Connection: "close"},
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (e: unknown) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      console.error("[watermarkImage] Sync request timed out", {requestId, timeoutMs});
      return {success: false, code: "watermark_timeout", message: "Image watermark service timed out"};
    }
    console.error("[watermarkImage] Sync request failed", {requestId, error: e});
    return {success: false, code: "watermark_error", message: "Failed to reach image watermark service"};
  }
  clearTimeout(timer);

  const rawText = await response.text();
  let payload: BackendSyncResponse | {detail?: unknown} | null = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    console.error("[watermarkImage] Invalid JSON from manager", {
      requestId,
      status: response.status,
      body: rawText?.slice(0, 500),
    });
    return {success: false, code: "watermark_error", message: "Watermark service returned invalid JSON"};
  }

  if (response.status === 422) {
    // Backend returns 422 with detail = full response dict for image-level
    // failures (image_too_extreme, malformed input, etc.). The "detail" field
    // can be either an object (FastAPI envelope) or a string (Pydantic schema
    // errors). Normalize to a message.
    const detail = (payload as {detail?: unknown} | null)?.detail;
    let message = "image rejected by watermark service";
    let code: WatermarkImageErrorCode = "watermark_error";
    if (typeof detail === "object" && detail !== null) {
      const d = detail as Partial<BackendSyncResponse>;
      message = d.message ?? message;
      if (typeof d.message === "string" && d.message.startsWith("image_too_extreme")) {
        code = "image_too_extreme";
      }
    } else if (typeof detail === "string") {
      message = detail;
    }
    console.warn("[watermarkImage] Image-level rejection (422)", {requestId, message, code});
    return {success: false, code, message};
  }

  if (response.status >= 500) {
    console.error("[watermarkImage] Manager 5xx", {requestId, status: response.status, body: rawText?.slice(0, 500)});
    return {success: false, code: "watermark_error", message: "Image watermark service error"};
  }

  if (!response.ok) {
    const detail = (payload as {detail?: string} | null)?.detail ?? "validation rejected by manager";
    console.error("[watermarkImage] Manager 4xx", {requestId, status: response.status, detail});
    return {success: false, code: "validation_error", message: String(detail)};
  }

  // 200 — happy path. The sync response includes the canonical path.
  const sync = payload as BackendSyncResponse;
  if (sync.status !== "completed" || !sync.path) {
    return {
      success: false,
      code: "watermark_error",
      message: sync.message ?? "manager returned non-completed status without an error",
    };
  }

  // Strip the "s3://bucket/" prefix to store just the key in the DB, matching
  // how original_url is stored.
  const processedKey = sync.path.startsWith("s3://")
    ? sync.path.replace(/^s3:\/\/[^/]+\//, "")
    : sync.path;

  console.log("[watermarkImage] Sync watermark complete", {
    requestId,
    imageId,
    processedKey,
    durationMs: undefined, // best-effort; we can wire a timer in a follow-up
  });

  return {
    success: true,
    processedUrl: processedKey,
    standardization: sync.standardization,
    message: sync.message,
  };
}
