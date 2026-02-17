/**
 * Watermark Completion Webhook
 *
 * Receives callbacks from the external watermarking service when jobs complete.
 * Verifies HMAC signature, validates user and video, updates DB, and sends email.
 * Public endpoint - no auth; validation via signature and payload.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceRoleClient } from "@/utils/supabase/service";
import { normalizeWatermarkPath } from "@/app/api/videos/[id]/watermark/route";

const SIGNATURE_HEADER = "x-signature";

type CallbackPayload = {
  timestamp?: string[];
  jobID?: (number | string)[];
  status?: string[];
  message?: string[];
  path?: string[];
  user_id?: string[];
  videoId?: string[];
};

function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const received = Buffer.from(signatureHeader, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (received.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(received, expectedBuf);
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.WATERMARK_CALLBACK_HMAC_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    const arrayBuffer = await request.arrayBuffer();
    const rawBody = Buffer.from(arrayBuffer);
    const signature = request.headers.get(SIGNATURE_HEADER);

    if (!verifySignature(rawBody, signature, secret)) {
      console.warn("[Watermark Webhook] Rejected: invalid HMAC signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody.toString("utf-8")) as CallbackPayload;
    const status = body.status?.[0];
    const pathValue = body.path?.[0];
    const callbackUserId = body.user_id?.[0];
    const jobId = body.jobID?.[0];
    const message = body.message?.[0];

    if (!callbackUserId) {
      return NextResponse.json(
        { error: "Missing user_id in callback" },
        { status: 400 }
      );
    }

    if (status !== "success") {
      console.log("[Watermark Webhook] Callback received (non-success)", {
        status,
        jobId,
        numericUserId: callbackUserId,
        message: message ?? "(none)",
      });
      return NextResponse.json({ received: true });
    }

    console.log("[Watermark Webhook] Processing success callback", {
      jobId,
      numericUserId: callbackUserId,
      path: pathValue,
    });

    if (!pathValue || pathValue === "Error") {
      return NextResponse.json(
        { error: "Invalid or missing path for success callback" },
        { status: 400 }
      );
    }

    const pathKey = normalizeWatermarkPath(pathValue);
    const callbackVideoId = body.videoId?.[0];
    const useVideoIdLookup = typeof callbackVideoId === "string" && callbackVideoId.trim() !== "";

    const supabase = createServiceRoleClient();

    const numericUserId =
      typeof callbackUserId === "string"
        ? parseInt(callbackUserId, 10)
        : callbackUserId;
    if (!Number.isInteger(numericUserId)) {
      return NextResponse.json(
        { error: "Invalid user_id format" },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("numeric_user_id", numericUserId)
      .single();

    if (profileError || !profile) {
      console.warn("[Watermark Webhook] User not found for numeric_user_id", { numericUserId });
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const authUserId = profile.id;

    let video: { id: string; user_id: string; filename: string; original_thumbnail_url: string | null; notification_sent_at: string | null } | null = null;
    let videoError: { message: string } | null = null;

    if (useVideoIdLookup) {
      const result = await supabase
        .from("videos")
        .select("id, user_id, filename, original_thumbnail_url, notification_sent_at")
        .eq("id", callbackVideoId!.trim())
        .eq("user_id", authUserId)
        .single();
      video = result.data;
      videoError = result.error;
      console.log("[Watermark Webhook] Resolved video by videoId", { videoId: callbackVideoId, found: !!video });
    }

    if (!video) {
      const originalKey = pathKey.replace(/-watermarked(\.[^./]+)$/, "$1");
      const result = await supabase
        .from("videos")
        .select("id, user_id, filename, original_thumbnail_url, notification_sent_at")
        .eq("user_id", authUserId)
        .eq("original_url", originalKey)
        .single();
      video = result.data;
      videoError = result.error;
      if (!useVideoIdLookup) {
        console.log("[Watermark Webhook] Resolved video by original_url", { originalKey });
      }
    }

    if (videoError || !video) {
      console.warn("[Watermark Webhook] Video not found", {
        authUserId,
        numericUserId,
        videoIdUsed: useVideoIdLookup ? callbackVideoId : undefined,
      });
      return NextResponse.json(
        { error: "Video not found for this user and path" },
        { status: 404 }
      );
    }

    const processedThumbnailUrl = video.original_thumbnail_url ?? null;

    const callbackReceivedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("videos")
      .update({
        processed_url: pathKey,
        processed_thumbnail_url: processedThumbnailUrl,
        status: "processed",
        callback_received_at: callbackReceivedAt,
        updated_at: callbackReceivedAt,
      })
      .eq("id", video.id)
      .eq("user_id", authUserId);

    if (updateError) {
      console.error("[Watermark Webhook] Failed to update video", {
        videoId: video.id,
        filename: video.filename,
        updateError,
      });
      return NextResponse.json(
        { error: "Failed to update video" },
        { status: 500 }
      );
    }

    console.log("[Watermark Webhook] Video updated", {
      videoId: video.id,
      filename: video.filename,
      processedPath: pathKey,
    });

    if (!video.notification_sent_at && video.filename) {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.admin.getUserById(authUserId);

        if (!userError && user?.email) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", authUserId)
            .single();

          const { sendWatermarkCompleteEmail } = await import("@/lib/email");
          await sendWatermarkCompleteEmail(
            user.email,
            video.filename,
            profileData?.display_name ?? null
          );

          await supabase
            .from("videos")
            .update({
              notification_sent_at: new Date().toISOString(),
            })
            .eq("id", video.id)
            .eq("user_id", authUserId);

          console.log("[Watermark Webhook] Completion email sent", {
            videoId: video.id,
            filename: video.filename,
          });
        }
      } catch (emailError) {
        console.error("[Watermark Webhook] Failed to send completion email", {
          videoId: video.id,
          filename: video.filename,
          error:
            emailError instanceof Error ? emailError.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Watermark Webhook] Unexpected error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
