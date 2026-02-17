import {NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {normalizeWatermarkPath} from "../../[id]/watermark/route";

type QueueStatusResponse = {
  timestamp: string[];
  jobID: string[];
  status: string[];
  message: string[];
  path: string[];
  videoId?: string[];
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

    const {data: profile, error: profileError} = await supabase
      .from("profiles")
      .select("numeric_user_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.numeric_user_id) {
      console.error("[Watermark] Failed to fetch user's numeric_user_id", {
        profileError,
        profileData: profile,
        userId: user.id,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "user_profile_error",
            message: "Failed to fetch user profile",
          },
        },
        {status: 500}
      );
    }

    // Use profile's numeric_user_id (not user.id UUID) for external watermark API
    const numericUserId = profile.numeric_user_id;
    const numericUserIdForApi = Number(numericUserId);
    if (!Number.isInteger(numericUserIdForApi)) {
      console.error("[Watermark] numeric_user_id is not a valid integer", {
        numeric_user_id: numericUserId,
        type: typeof numericUserId,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "user_profile_error",
            message: "Invalid numeric user ID in profile",
          },
        },
        {status: 500}
      );
    }

    const queueStatusUrl = `${watermarkServiceUrl.replace(/\/+$/, "")}/queue_status/${numericUserIdForApi}`;
    const response = await fetch(queueStatusUrl, {
      method: "GET",
    });

    const rawText = await response.text();

    if (!response.ok) {
      console.log("[Watermark] External API queue_status non-OK", { status: response.status, rawBody: rawText?.slice(0, 300) });
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
      console.log("[Watermark] External API queue_status raw response", { rawBody: rawText?.slice(0, 500) });
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

    // Log actual response from external API to confirm shape (e.g. jobID array)
    console.log("[Watermark] External API queue_status response", {
      status: response.status,
      keys: Object.keys(payload),
      jobID: payload.jobID,
      length: payload.jobID?.length,
    });

    const length = payload.jobID.length;
    const jobs = [] as {
      jobId: string;
      timestamp: string | null;
      status: string | null;
      message: string | null;
      path: string | null;
      pathKey: string | null;
      videoId: string | null;
    }[];

    for (let i = 0; i < length; i++) {
      const jobId = payload.jobID[i];
      const ts = payload.timestamp[i] ?? null;
      const statusValue = payload.status[i] ?? null;
      const messageValue = payload.message[i] ?? null;
      const pathValue = payload.path[i] ?? null;
      const pathKey = pathValue && pathValue !== "None" ? normalizeWatermarkPath(pathValue) : null;
      const rawVideoId = payload.videoId?.[i] ?? null;
      const videoIdValue =
        rawVideoId != null ? (String(rawVideoId).trim() || null) : null;

      jobs.push({
        jobId,
        timestamp: ts,
        status: statusValue,
        message: messageValue,
        path: pathValue,
        pathKey,
        videoId: videoIdValue,
      });
    }

    // Deduplicate by videoId: one job per video so the UI shows a single state.
    // Priority: processing > failed > success/completed; within same status keep latest by timestamp.
    type JobItem = (typeof jobs)[number];
    const statusRank = (status: string | null): number => {
      if (status == null) return 4;
      const s = status.toLowerCase();
      if (s === "processing") return 1;
      if (s === "failed") return 2;
      if (s === "success" || s === "completed") return 3;
      return 4;
    };
    const jobsWithVideoId = jobs.filter((j) => j.videoId != null && String(j.videoId).trim() !== "");
    const jobsWithoutVideoId = jobs.filter((j) => !j.videoId || String(j.videoId).trim() === "");
    const videoIdToJob = new Map<string, JobItem>();
    for (const job of jobsWithVideoId) {
      const vid = String(job.videoId).trim();
      const existing = videoIdToJob.get(vid);
      if (!existing) {
        videoIdToJob.set(vid, job);
        continue;
      }
      const existingRank = statusRank(existing.status);
      const jobRank = statusRank(job.status);
      if (jobRank < existingRank) {
        videoIdToJob.set(vid, job);
        continue;
      }
      if (jobRank > existingRank) continue;
      const tsExisting = existing.timestamp ?? "";
      const tsJob = job.timestamp ?? "";
      if (tsJob > tsExisting) videoIdToJob.set(vid, job);
    }
    const deduplicatedJobs: JobItem[] = [...jobsWithoutVideoId, ...Array.from(videoIdToJob.values())];

    // Video updates and emails are handled exclusively by the callback (POST /api/webhooks/watermark-complete).
    // This route returns job status for UI progress display only.
    const videosUpdated = 0;

    const isTerminalStatus = (status: string | null) => {
      if (status == null) return false;
      const s = status.toLowerCase();
      return s === "completed" || s === "success" || s === "failed";
    };

    // Clear terminal jobs from the queue so it does not grow unbounded.
    // Use job_ids to clear only terminal jobs (success/completed/failed); leave processing jobs.
    const terminalJobIds = jobs.filter((j) => isTerminalStatus(j.status)).map((j) => j.jobId);
    if (terminalJobIds.length > 0) {
      const clearQueueUrl = `${watermarkServiceUrl.replace(/\/+$/, "")}/clear_queue`;
      try {
        const clearQueueResponse = await fetch(clearQueueUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Connection: "close",
          },
          body: JSON.stringify({
            user_id: numericUserIdForApi,
            job_ids: terminalJobIds,
          }),
        });
        const clearQueueResponseText = await clearQueueResponse.text();

        if (!clearQueueResponse.ok) {
          console.warn("[Watermark] clear_queue failed", {
            status: clearQueueResponse.status,
            numericUserIdLast4: String(numericUserIdForApi).slice(-4),
            terminalCount: terminalJobIds.length,
            response: clearQueueResponseText?.slice(0, 200),
          });
        }
      } catch (clearQueueError) {
        console.error("[Watermark] clear_queue error", {
          numericUserIdLast4: String(numericUserIdForApi).slice(-4),
          error: clearQueueError instanceof Error ? clearQueueError.message : String(clearQueueError),
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        jobs: deduplicatedJobs,
        videosUpdated,
        hasCompletedJobs: deduplicatedJobs.some((j) => j.status === "completed" || j.status === "success"),
      },
    });
  } catch (error) {
    console.error("[Watermark] Unexpected error in status route:", error);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}
