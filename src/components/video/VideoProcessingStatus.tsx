"use client";

import {Progress} from "@/components/ui/progress";
import {
  isVideoNormalizing,
  isVideoWatermarking,
  resolveWatermarkProgress,
} from "@/lib/watermark-progress";

type VideoProcessingStatusProps = {
  video: {
    status: string;
    processed_url?: string | null;
    normalization_status?: string | null;
    normalization_message?: string | null;
  };
  pendingJob?: {
    message: string | null;
    failed?: boolean;
    segmentsDone?: number | null;
    segmentsTotal?: number | null;
  } | null;
};

export function VideoProcessingStatus({video, pendingJob}: VideoProcessingStatusProps) {
  const normalizing = isVideoNormalizing(video);
  const watermarking = isVideoWatermarking(video, pendingJob);

  if (!normalizing && !watermarking) return null;

  const rawMessage = watermarking
    ? pendingJob?.message ?? "Watermarking…"
    : video.normalization_message ?? "Preparing for streaming…";

  const progress = resolveWatermarkProgress(
    rawMessage,
    pendingJob?.segmentsDone,
    pendingJob?.segmentsTotal,
  );
  const label = progress?.label ?? rawMessage;
  const percent = progress?.percent ?? null;
  const heading = watermarking ? "Watermarking" : "Preparing video";

  return (
    <div className="mt-2 max-w-[450px] space-y-1.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{heading}</span>
        {percent != null && (
          <span className="text-xs tabular-nums text-amber-600 dark:text-amber-500">{percent}%</span>
        )}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
      <Progress value={percent} className="h-1.5" />
    </div>
  );
}
