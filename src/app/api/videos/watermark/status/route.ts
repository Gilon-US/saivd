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

    const numericUserId = profile.numeric_user_id;
    console.log("[Watermark] Successfully fetched numeric_user_id", {
      userId: user.id,
      numericUserId,
    });

    const queueStatusUrl = `${watermarkServiceUrl.replace(/\/+$/, "")}/queue_status/${numericUserId}`;
    const requestBody = {
      user_id: numericUserId,
    };
    
    console.log(`[Watermark] Calling queue_status endpoint - URL: ${queueStatusUrl}`);
    console.log("[Watermark] queue_status request details", {
      url: queueStatusUrl,
      numericUserId,
      watermarkServiceUrl,
      method: "POST",
      body: requestBody,
    });

    const response = await fetch(queueStatusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const rawText = await response.text();
    console.log(`[Watermark] Received queue_status response from URL: ${queueStatusUrl}`);
    console.log("[Watermark] queue_status response details", {
      url: queueStatusUrl,
      numericUserId,
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

    // Track if any videos were updated
    let videosUpdated = 0;

    // For any completed jobs with a concrete path, update the corresponding video
    // Note: API returns "success" for completed jobs, not "completed"
    for (const job of jobs) {
      if ((job.status !== "completed" && job.status !== "success") || !job.pathKey) continue;

      // Derive original key from the processed key by removing the -watermarked suffix
      const originalKey = job.pathKey.replace(/-watermarked(\.[^./]+)$/, "$1");

      try {
        const {data: video, error: fetchError} = await supabase
          .from("videos")
          .select("id, user_id, filename, original_thumbnail_url, notification_sent_at")
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
        } else {
          videosUpdated++;
          console.log("[Watermark] Successfully updated video for completed job", {
            jobId: job.jobId,
            videoId: video.id,
            processedUrl: job.pathKey,
          });

          // Send email notification if not already sent
          if (!video.notification_sent_at && video.filename) {
            try {
              // Get user's display name from profile (optional)
              const {data: profile} = await supabase
                .from("profiles")
                .select("display_name")
                .eq("id", user.id)
                .single();

              // Import email function dynamically to avoid loading issues if env vars are missing
              const {sendWatermarkCompleteEmail} = await import("@/lib/email");
              
              await sendWatermarkCompleteEmail(
                user.email || '',
                video.filename,
                profile?.display_name || null
              );

              // Update notification_sent_at timestamp
              await supabase
                .from("videos")
                .update({
                  notification_sent_at: new Date().toISOString(),
                })
                .eq("id", video.id)
                .eq("user_id", user.id);

              console.log("[Watermark] Successfully sent completion email", {
                videoId: video.id,
                filename: video.filename,
                userEmail: user.email,
              });
            } catch (emailError) {
              console.error("[Watermark] Failed to send completion email", {
                videoId: video.id,
                filename: video.filename,
                error: emailError instanceof Error ? emailError.message : 'Unknown error',
              });
              // Don't fail the video update - email is nice-to-have
            }
          }
        }
      } catch (e) {
        console.error("[Watermark] Unexpected error while updating video for completed job", {
          jobId: job.jobId,
          error: e,
        });
      }
    }

    // After all database updates are persisted, check if all jobs are completed
    // If all jobs are completed, call clear_queue to avoid loading stale data
    const allJobsCompleted = jobs.length > 0 && jobs.every((job) => job.status === "completed" || job.status === "success");
    
    if (allJobsCompleted) {
      const clearQueueUrl = `${watermarkServiceUrl.replace(/\/+$/, "")}/clear_queue/${numericUserId}`;
      try {
        console.log(`[Watermark] Calling clear_queue endpoint - URL: ${clearQueueUrl}`);
        console.log("[Watermark] clear_queue request details", {
          url: clearQueueUrl,
          numericUserId,
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
        });

        const clearQueueResponseText = await clearQueueResponse.text();
        
        if (clearQueueResponse.ok) {
          console.log(`[Watermark] Successfully cleared watermarking queue - URL: ${clearQueueUrl}`);
          console.log("[Watermark] clear_queue success details", {
            url: clearQueueUrl,
            numericUserId,
            status: clearQueueResponse.status,
            responseText: clearQueueResponseText,
          });
        } else {
          console.warn(`[Watermark] Failed to clear watermarking queue - URL: ${clearQueueUrl}`);
          console.warn("[Watermark] clear_queue failure details", {
            url: clearQueueUrl,
            numericUserId,
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
          numericUserId,
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
