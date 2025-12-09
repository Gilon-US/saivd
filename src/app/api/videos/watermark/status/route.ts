import {NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {normalizeWatermarkPath} from "../../[id]/watermark/route";

type QueueStatusResponse = {
  timestamp: string[];
  jobID: number[];
  status: string[];
  message: string[];
  path: string[];
};

export async function GET() {
  try {
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

    const queueStatusUrl = `${watermarkServiceUrl.replace(/\/+$/, "")}/queue_status`;

    const response = await fetch(queueStatusUrl, {
      method: "GET",
    });

    const rawText = await response.text();
    console.log("[Watermark] Received queue_status response", {
      status: response.status,
      statusText: response.statusText,
      body: rawText,
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "watermark_status_error",
            message: "Failed to fetch watermark queue status",
          },
        },
        {status: 502}
      );
    }

    let payload: QueueStatusResponse | null = null;
    try {
      payload = rawText ? (JSON.parse(rawText) as QueueStatusResponse) : null;
    } catch (e) {
      console.error("[Watermark] Failed to parse JSON from queue_status", e);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "watermark_status_error",
            message: "Watermark status service returned an invalid response",
          },
        },
        {status: 502}
      );
    }

    if (!payload) {
      return NextResponse.json({success: true, data: {jobs: []}});
    }

    const length = payload.jobID.length;
    const jobs = [] as {
      jobId: number;
      timestamp: string | null;
      status: string | null;
      message: string | null;
      path: string | null;
      pathKey: string | null;
    }[];

    for (let i = 0; i < length; i++) {
      const jobId = payload.jobID[i];
      const ts = payload.timestamp[i] ?? null;
      const statusValue = payload.status[i] ?? null;
      const messageValue = payload.message[i] ?? null;
      const pathValue = payload.path[i] ?? null;
      const pathKey = pathValue && pathValue !== "None" ? normalizeWatermarkPath(pathValue) : null;

      jobs.push({
        jobId,
        timestamp: ts,
        status: statusValue,
        message: messageValue,
        path: pathValue,
        pathKey,
      });
    }

    // For any successful jobs with a concrete path, update the corresponding video
    for (const job of jobs) {
      if (job.status !== "success" || !job.pathKey) continue;

      // Derive original key from the processed key by removing the -watermarked suffix
      const originalKey = job.pathKey.replace(/-watermarked(\.[^./]+)$/, "$1");

      try {
        const {data: video, error: fetchError} = await supabase
          .from("videos")
          .select("id, user_id, original_thumbnail_url")
          .eq("user_id", user.id)
          .eq("original_url", originalKey)
          .single();

        if (fetchError || !video) {
          if (fetchError?.code !== "PGRST116") {
            console.error("[Watermark] Could not find video for completed job", {jobId: job.jobId, fetchError});
          }
          continue;
        }

        const processedThumbnailUrl = video.original_thumbnail_url ?? null;

        const {error: updateError} = await supabase
          .from("videos")
          .update({
            processed_url: job.pathKey,
            processed_thumbnail_url: processedThumbnailUrl,
            status: "processed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", video.id)
          .eq("user_id", user.id);

        if (updateError) {
          console.error("[Watermark] Failed to update video for completed job", {jobId: job.jobId, updateError});
        }
      } catch (e) {
        console.error("[Watermark] Unexpected error while updating video for completed job", {
          jobId: job.jobId,
          error: e,
        });
      }
    }

    return NextResponse.json({success: true, data: {jobs}});
  } catch (error) {
    console.error("Unexpected error in GET /api/videos/watermark/status:", error);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}
