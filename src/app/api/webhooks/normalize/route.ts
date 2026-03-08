/**
 * Normalize Completion Webhook
 *
 * Receives callbacks from the external normalize service (progress and final status).
 * Verifies HMAC signature, updates video normalized_url and normalization_status.
 * Public endpoint - no auth; validation via signature and videoId query param.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceRoleClient } from "@/utils/supabase/service";

const SIGNATURE_HEADER = "x-signature";

type NormalizeCallbackPayload = {
  status: "processing" | "success" | "failed";
  message?: string;
  input_location?: string;
  output_location?: string;
  job_id?: string;
  width?: number;
  height?: number;
  fps?: number;
  frame_count?: number;
};

function verifyNormalizeSignature(
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
    const secret = process.env.NORMALIZE_CALLBACK_HMAC_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const videoId = url.searchParams.get("videoId");
    if (!videoId || !videoId.trim()) {
      return NextResponse.json(
        { error: "Missing videoId query parameter" },
        { status: 400 }
      );
    }

    const arrayBuffer = await request.arrayBuffer();
    const rawBody = Buffer.from(arrayBuffer);
    const signature = request.headers.get(SIGNATURE_HEADER);

    if (!verifyNormalizeSignature(rawBody, signature, secret)) {
      console.warn("[Normalize Webhook] Rejected: invalid HMAC signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    let payload: NormalizeCallbackPayload;
    try {
      payload = JSON.parse(rawBody.toString("utf-8")) as NormalizeCallbackPayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { status, message, output_location } = payload;
    const supabase = createServiceRoleClient();

    if (status === "processing") {
      const { error: updateError } = await supabase
        .from("videos")
        .update({
          normalization_status: "normalizing",
          normalization_message: message ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId.trim());

      if (updateError) {
        console.error("[Normalize Webhook] Failed to update progress", {
          videoId,
          updateError,
        });
        return NextResponse.json(
          { error: "Failed to update video" },
          { status: 500 }
        );
      }
      return NextResponse.json({ received: true });
    }

    if (status === "success") {
      if (!output_location || typeof output_location !== "string") {
        return NextResponse.json(
          { error: "Missing output_location for success callback" },
          { status: 400 }
        );
      }
      const updatePayload: Record<string, unknown> = {
        normalized_url: output_location,
        normalization_status: "completed",
        normalization_message: null,
        updated_at: new Date().toISOString(),
      };
      const { error: updateError } = await supabase
        .from("videos")
        .update(updatePayload)
        .eq("id", videoId.trim());

      if (updateError) {
        console.error("[Normalize Webhook] Failed to update on success", {
          videoId,
          updateError,
        });
        return NextResponse.json(
          { error: "Failed to update video" },
          { status: 500 }
        );
      }
      console.log("[Normalize Webhook] Video normalized", {
        videoId,
        output_location,
      });
      return NextResponse.json({ received: true });
    }

    if (status === "failed") {
      const { error: updateError } = await supabase
        .from("videos")
        .update({
          normalization_status: "failed",
          normalization_message: message ?? "Normalization failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId.trim());

      if (updateError) {
        console.error("[Normalize Webhook] Failed to update on failure", {
          videoId,
          updateError,
        });
        return NextResponse.json(
          { error: "Failed to update video" },
          { status: 500 }
        );
      }
      console.log("[Normalize Webhook] Normalization failed", {
        videoId,
        message: message ?? "(none)",
      });
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Normalize Webhook] Unexpected error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
