/**
 * Server-only helper to clear watermark queue jobs for a given video.
 * Used when a user deletes a video or the watermarked version so the queue
 * does not keep jobs for that video.
 */

type QueueStatusPayload = {
  jobID: string[];
  videoId?: string[];
};

/**
 * Fetches queue_status for the user, finds jobs whose videoId matches the given
 * videoId, and clears those jobs from the queue. Logs and returns on errors
 * (does not throw).
 */
export async function clearWatermarkQueueJobsForVideo(
  numericUserId: number,
  videoId: string
): Promise<void> {
  const baseUrl = process.env.WATERMARK_SERVICE_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    console.warn("[Watermark] clearWatermarkQueueJobsForVideo: WATERMARK_SERVICE_URL not set");
    return;
  }

  const videoIdTrimmed = videoId.trim();
  if (!videoIdTrimmed) {
    return;
  }

  try {
    const queueStatusUrl = `${baseUrl}/queue_status/${numericUserId}`;
    const response = await fetch(queueStatusUrl, { method: "GET" });
    const rawText = await response.text();

    if (!response.ok) {
      console.warn("[Watermark] clearWatermarkQueueJobsForVideo queue_status non-OK", {
        status: response.status,
        videoId: videoIdTrimmed,
        rawBody: rawText?.slice(0, 200),
      });
      return;
    }

    let payload: QueueStatusPayload | null = null;
    try {
      payload = rawText ? (JSON.parse(rawText) as QueueStatusPayload) : null;
    } catch (e) {
      console.warn("[Watermark] clearWatermarkQueueJobsForVideo parse error", {
        videoId: videoIdTrimmed,
        error: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    if (!payload?.jobID?.length) {
      return;
    }

    const jobIdsToClear: string[] = [];
    const length = payload.jobID.length;
    for (let i = 0; i < length; i++) {
      const jobId = payload.jobID[i];
      const raw = payload.videoId?.[i] ?? null;
      const jobVideoId = raw != null ? String(raw).trim() : "";
      if (jobVideoId === videoIdTrimmed) {
        jobIdsToClear.push(jobId);
      }
    }

    if (jobIdsToClear.length === 0) {
      return;
    }

    const clearQueueUrl = `${baseUrl}/clear_queue`;
    const clearResponse = await fetch(clearQueueUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Connection: "close",
      },
      body: JSON.stringify({
        user_id: numericUserId,
        job_ids: jobIdsToClear,
      }),
    });
    const clearResponseText = await clearResponse.text();

    if (!clearResponse.ok) {
      console.warn("[Watermark] clearWatermarkQueueJobsForVideo clear_queue failed", {
        status: clearResponse.status,
        videoId: videoIdTrimmed,
        count: jobIdsToClear.length,
        response: clearResponseText?.slice(0, 200),
      });
    }
  } catch (error) {
    console.error("[Watermark] clearWatermarkQueueJobsForVideo error", {
      videoId: videoIdTrimmed,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
