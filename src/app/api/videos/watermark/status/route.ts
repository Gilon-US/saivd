import {NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {normalizeWatermarkPath} from "../../[id]/watermark/route";

type QueueStatusResponse = {
  timestamp: string[];
  jobID: string[];
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

    // Fetch user's numeric_user_id from profile
    console.log("[Watermark] Fetching user's numeric_user_id", {
      userId: user.id,
      email: user.email,
    });

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
    console.log("[Watermark] Successfully fetched numeric_user_id (sent to external API)", {
      userId: user.id,
      numericUserId: numericUserIdForApi,
      numericUserIdLast4: String(numericUserIdForApi).slice(-4),
    });

    const queueStatusUrl = `${watermarkServiceUrl.replace(/\/+$/, "")}/queue_status/${numericUserIdForApi}`;
    
    console.log(`[Watermark] Calling queue_status endpoint - URL: ${queueStatusUrl}`);
    console.log("[Watermark] queue_status request details", {
      url: queueStatusUrl,
      numericUserId: numericUserIdForApi,
      watermarkServiceUrl,
      method: "GET",
    });

    const response = await fetch(queueStatusUrl, {
      method: "GET",
    });

    const rawText = await response.text();
    console.log(`[Watermark] Received queue_status response from URL: ${queueStatusUrl}`);
    console.log("[Watermark] queue_status response details", {
      url: queueStatusUrl,
      numericUserId: numericUserIdForApi,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      bodyLength: rawText?.length || 0,
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
      jobId: string;
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

    // Video updates and emails are now handled by the webhook callback (POST /api/webhooks/watermark-complete).
    // This route only returns job status for UI progress display.
    const videosUpdated = 0;

    // Check if all jobs are completed.
    // If so, call clear_queue so the same jobs are not returned on the next poll.
    const allJobsCompleted =
      jobs.length > 0 &&
      jobs.every(
        (job) =>
          job.status === "completed" ||
          job.status === "success" ||
          job.status?.toLowerCase() === "completed" ||
          job.status?.toLowerCase() === "success"
      );

    if (allJobsCompleted) {
      // Backend expects POST /clear_queue with body { user_id: number }, not a path parameter.
      const clearQueueUrl = `${watermarkServiceUrl.replace(/\/+$/, "")}/clear_queue`;
      try {
        console.log(`[Watermark] Calling clear_queue endpoint - URL: ${clearQueueUrl}`);
        console.log("[Watermark] clear_queue request details", {
          url: clearQueueUrl,
          numericUserId: numericUserIdForApi,
          watermarkServiceUrl,
          method: "POST",
          allJobsCompleted,
          jobsCount: jobs.length,
        });

        const clearQueueResponse = await fetch(clearQueueUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ user_id: numericUserIdForApi }),
        });

        const clearQueueResponseText = await clearQueueResponse.text();
        
        if (clearQueueResponse.ok) {
          console.log(`[Watermark] Successfully cleared watermarking queue - URL: ${clearQueueUrl}`);
          console.log("[Watermark] clear_queue success details", {
            url: clearQueueUrl,
            numericUserId: numericUserIdForApi,
            status: clearQueueResponse.status,
            responseText: clearQueueResponseText,
          });
        } else {
          console.warn(`[Watermark] Failed to clear watermarking queue - URL: ${clearQueueUrl}`);
          console.warn("[Watermark] clear_queue failure details", {
            url: clearQueueUrl,
            numericUserId: numericUserIdForApi,
            status: clearQueueResponse.status,
            statusText: clearQueueResponse.statusText,
            headers: Object.fromEntries(clearQueueResponse.headers.entries()),
            responseText: clearQueueResponseText,
          });
          // Don't fail the request if clear_queue fails - this is a cleanup operation
        }
      } catch (clearQueueError) {
        console.error(`[Watermark] Error calling clear_queue - URL: ${clearQueueUrl}`);
        console.error("[Watermark] clear_queue error details", {
          url: clearQueueUrl,
          numericUserId: numericUserIdForApi,
          error: clearQueueError instanceof Error ? clearQueueError.message : String(clearQueueError),
          errorStack: clearQueueError instanceof Error ? clearQueueError.stack : undefined,
        });
        // Don't fail the request if clear_queue fails - this is a cleanup operation
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        jobs,
        videosUpdated,
        hasCompletedJobs: jobs.some((j) => j.status === "completed" || j.status === "success"),
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/videos/watermark/status:", error);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Server error"}}, {status: 500});
  }
}
