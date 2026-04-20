import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {enqueueWatermarkForVideo} from "@/lib/enqueue-watermark";

// POST /api/videos/[id]/watermark
// Creates a watermarked version of the video by calling the external watermark service.
export async function POST(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: videoId} = await context.params;
    const requestId = `wm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!videoId || typeof videoId !== "string" || !videoId.trim()) {
      console.warn("[Watermark] Invalid request payload", {requestId, videoId});
      return NextResponse.json(
        {success: false, error: {code: "validation_error", message: "Video ID is required"}},
        {status: 400}
      );
    }

    // Authenticated user
    const supabase = await createClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn("[Watermark] Unauthorized watermark request", {requestId, videoId});
      return NextResponse.json(
        {success: false, error: {code: "unauthorized", message: "Authentication required"}},
        {status: 401}
      );
    }
    console.log("[Watermark] Received watermark request", {
      requestId,
      videoId,
      userId: user.id,
    });

    // Load video and ensure it belongs to the user (authorization check only).
    const {data: video, error: videoError} = await supabase
      .from("videos")
      .select("id, user_id")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) {
      console.error("[Watermark] Video not found or not owned by user", {
        requestId,
        videoId,
        userId: user.id,
        videoError,
      });
      return NextResponse.json({success: false, error: {code: "not_found", message: "Video not found"}}, {status: 404});
    }

    console.log("[Watermark] Enqueuing watermark job", {
      requestId,
      videoId: video.id,
      userId: user.id,
    });
    const enqueueResult = await enqueueWatermarkForVideo(videoId.trim());

    if (!enqueueResult.success) {
      const {code, message} = enqueueResult;
      console.error("[Watermark] Failed to enqueue watermark job", {
        requestId,
        videoId: video.id,
        userId: user.id,
        code,
        message,
      });

      if (code === "not_found") {
        return NextResponse.json(
          {success: false, error: {code, message: message || "Video not found"}},
          {status: 404}
        );
      }

      if (code === "validation_error") {
        return NextResponse.json(
          {success: false, error: {code, message: message || "Validation error"}},
          {status: 400}
        );
      }

      if (code === "video_id_required" || code === "watermark_timeout") {
        return NextResponse.json(
          {success: false, error: {code, message}},
          {status: code === "watermark_timeout" ? 504 : 400}
        );
      }

      if (code === "watermark_error") {
        return NextResponse.json(
          {success: false, error: {code, message}},
          {status: 502}
        );
      }

      if (code === "database_error") {
        return NextResponse.json(
          {success: false, error: {code, message}},
          {status: 500}
        );
      }

      // Config / profile issues and other server-side errors
      return NextResponse.json(
        {success: false, error: {code, message}},
        {status: 500}
      );
    }

    console.log("[Watermark] Watermark job enqueued", {
      requestId,
      videoId: video.id,
      userId: user.id,
      jobId: enqueueResult.jobId ?? null,
    });
    return NextResponse.json({
      success: true,
      data: {
        videoId: video.id,
        message: null,
        jobId: enqueueResult.jobId,
      },
    });
  } catch (error) {
    console.error("[Watermark] Unexpected error in POST /api/videos/[id]/watermark:", error);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}
