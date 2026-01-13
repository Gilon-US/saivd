"use client";
import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {UploadIcon, RefreshCwIcon, TrashIcon, Download, QrCode} from "lucide-react";
import Image from "next/image";
import {useToast} from "@/hooks/useToast";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {DeleteConfirmDialog} from "./DeleteConfirmDialog";
import {DeleteWatermarkedConfirmDialog} from "./DeleteWatermarkedConfirmDialog";
import {WatermarkStartNotification} from "./WatermarkStartNotification";
import {VideoPlayer} from "./VideoPlayer";
import {useState, useEffect, useRef} from "react";

export type Video = {
  id: string;
  filename: string;
  original_url: string;
  original_thumbnail_url: string;
  preview_thumbnail_data: string | null;
  processed_url: string | null;
  processed_thumbnail_url: string | null;
  status: "uploaded" | "processing" | "processed" | "failed";
  upload_date: string;
};

type VideoGridProps = {
  videos: Video[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSilentRefresh: () => void;
  onOpenUploadModal: () => void;
};

export function VideoGrid({videos, isLoading, error, onRefresh, onSilentRefresh, onOpenUploadModal}: VideoGridProps) {
  const {toast} = useToast();
  const [pendingJobs, setPendingJobs] = useState<
    Record<
      string,
      {
        message: string | null;
      }
    >
  >({});
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    video: Video | null;
    isDeleting: boolean;
  }>({
    isOpen: false,
    video: null,
    isDeleting: false,
  });

  const [deleteWatermarkedDialog, setDeleteWatermarkedDialog] = useState<{
    isOpen: boolean;
    video: Video | null;
    isDeleting: boolean;
  }>({
    isOpen: false,
    video: null,
    isDeleting: false,
  });

  const [watermarkStartNotification, setWatermarkStartNotification] = useState<{
    isOpen: boolean;
    videoFilename: string;
  }>({
    isOpen: false,
    videoFilename: "",
  });

  const [videoPlayer, setVideoPlayer] = useState<{
    isOpen: boolean;
    videoUrl: string | null;
    videoId: string | null;
    enableFrameAnalysis: boolean;
    verificationStatus: "verifying" | "verified" | "failed" | null;
    verifiedUserId: string | null;
  }>({
    isOpen: false,
    videoUrl: null,
    videoId: null,
    enableFrameAnalysis: false,
    verificationStatus: null,
    verifiedUserId: null,
  });

  const [isOpeningVideo, setIsOpeningVideo] = useState<string | null>(null);
  const verificationAbortControllerRef = useRef<AbortController | null>(null);

  const handleVideoClick = async (video: Video, variant: "original" | "watermarked" = "original") => {
    try {
      setIsOpeningVideo(video.id);
      console.log("[VideoGrid] Opening video for playback", {
        videoId: video.id,
        variant,
      });
      const response = await fetch(`/api/videos/${video.id}/play?variant=${variant}`);
      const data = await response.json();
      if (!response.ok || !data.success || !data.data?.playbackUrl) {
        throw new Error(data.error?.message || "Failed to generate playback URL");
      }

      // For watermarked videos, verify authenticity before allowing playback
      if (variant === "watermarked") {
        // Set initial state to verifying
        setVideoPlayer({
          isOpen: true,
          videoUrl: data.data.playbackUrl,
          videoId: video.id,
          enableFrameAnalysis: true,
          verificationStatus: "verifying",
          verifiedUserId: null,
        });

        // Create AbortController for this request
        verificationAbortControllerRef.current = new AbortController();

        // Immediately verify by extracting user ID from frame 0
        try {
          const verifyResponse = await fetch(`/api/videos/${video.id}/extract-user-id?frame_index=0`, {
            signal: verificationAbortControllerRef.current.signal,
          });
          const verifyData = await verifyResponse.json();

          if (verifyResponse.ok && verifyData.success && verifyData.data?.user_id) {
            // Verification successful - allow playback and store user ID for QR code
            setVideoPlayer((prev) => ({
              ...prev,
              verificationStatus: "verified",
              verifiedUserId: verifyData.data.user_id,
            }));
          } else {
            // Verification failed - no valid user ID
            setVideoPlayer((prev) => ({
              ...prev,
              verificationStatus: "failed",
            }));
          }
        } catch (verifyError) {
          // Handle abort separately (user closed player)
          if (verifyError instanceof Error && verifyError.name === "AbortError") {
            console.log("[VideoGrid] Verification request aborted");
            return;
          }
          // Other errors - verification failed
          console.error("[VideoGrid] Verification error:", verifyError);
          setVideoPlayer((prev) => ({
            ...prev,
            verificationStatus: "failed",
          }));
        }
      } else {
            // Original videos don't need verification
            setVideoPlayer({
              isOpen: true,
              videoUrl: data.data.playbackUrl,
              videoId: video.id,
              enableFrameAnalysis: false,
              verificationStatus: null,
              verifiedUserId: null,
            });
      }
    } catch (error) {
      console.error("Error opening video:", error);
      toast({
        title: "Unable to play video",
        description:
          error instanceof Error ? error.message : "There was a problem generating a playback URL. Please try again.",
        variant: "error",
      });
    } finally {
      setIsOpeningVideo(null);
    }
  };

  const handleClosePlayer = () => {
    // Cancel any pending verification request
    if (verificationAbortControllerRef.current) {
      verificationAbortControllerRef.current.abort();
      verificationAbortControllerRef.current = null;
    }

    setVideoPlayer({
      isOpen: false,
      videoUrl: null,
      videoId: null,
      enableFrameAnalysis: false,
      verificationStatus: null,
      verifiedUserId: null,
    });
  };

  const handleDeleteWatermarkedClick = (video: Video) => {
    // Check if watermarked version exists
    if (!video.processed_url || video.status !== "processed") {
      toast({
        title: "Delete unavailable",
        description: "Watermarked version is not available for deletion.",
        variant: "error",
      });
      return;
    }

    setDeleteWatermarkedDialog({
      isOpen: true,
      video,
      isDeleting: false,
    });
  };

  const handleDeleteWatermarkedCancel = () => {
    setDeleteWatermarkedDialog({
      isOpen: false,
      video: null,
      isDeleting: false,
    });
  };

  const handleDeleteWatermarkedConfirm = async () => {
    if (!deleteWatermarkedDialog.video) return;

    setDeleteWatermarkedDialog((prev) => ({...prev, isDeleting: true}));

    try {
      const response = await fetch(`/api/videos/${deleteWatermarkedDialog.video.id}/watermarked`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to delete watermarked video");
      }

      toast({
        title: "Watermarked video deleted",
        description: `Watermarked version of "${deleteWatermarkedDialog.video.filename}" has been deleted successfully.`,
        variant: "success",
      });

      // Close dialog and refresh the grid
      setDeleteWatermarkedDialog({
        isOpen: false,
        video: null,
        isDeleting: false,
      });

      onRefresh();
    } catch (error) {
      console.error("Error deleting watermarked video:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete watermarked video. Please try again.",
        variant: "error",
      });

      setDeleteWatermarkedDialog((prev) => ({...prev, isDeleting: false}));
    }
  };

  const handleDownloadWatermarked = async (video: Video) => {
    try {
      // Check if watermarked version exists
      if (!video.processed_url || video.status !== "processed") {
        toast({
          title: "Download unavailable",
          description: "Watermarked version is not available for download.",
          variant: "error",
        });
        return;
      }

      // Show loading toast
      toast({
        title: "Preparing download",
        description: `Generating download link for "${video.filename}"...`,
      });

      // Get presigned URL for watermarked video
      const response = await fetch(`/api/videos/${video.id}/play?variant=watermarked`);
      const data = await response.json();

      if (!response.ok || !data.success || !data.data?.playbackUrl) {
        throw new Error(data.error?.message || "Failed to generate download URL");
      }

      const presignedUrl = data.data.playbackUrl;

      // Fetch the video file as a blob
      const videoResponse = await fetch(presignedUrl);
      if (!videoResponse.ok) {
        throw new Error("Failed to fetch video file");
      }

      const blob = await videoResponse.blob();

      // Create object URL from blob
      const blobUrl = URL.createObjectURL(blob);

      // Create temporary anchor element for download
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = video.filename.replace(/\.[^/.]+$/, "-watermarked.mp4"); // Add -watermarked suffix
      document.body.appendChild(anchor);
      anchor.click();

      // Cleanup
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);

      // Show success toast
      toast({
        title: "Download started",
        description: `Downloading "${video.filename}"...`,
        variant: "success",
      });
    } catch (error) {
      console.error("Error downloading watermarked video:", error);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download video. Please try again.",
        variant: "error",
      });
    }
  };

  const handleCreateWatermark = async (video: Video) => {
    toast({
      title: "Creating watermarked version",
      description: `Starting watermark process for "${video.filename}"`,
    });

    try {
      const response = await fetch(`/api/videos/${video.id}/watermark`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to create watermarked video");
      }

      const initialMessage: string | null = data.data?.message ?? null;

      setPendingJobs((prev) => ({
        ...prev,
        [video.id]: {
          message: initialMessage,
        },
      }));

      // Show notification modal
      setWatermarkStartNotification({
        isOpen: true,
        videoFilename: video.filename,
      });

      // Refresh the video list so the status is updated to processing
      onRefresh();
    } catch (error) {
      console.error("Error creating watermarked version:", error);
      toast({
        title: "Watermark failed",
        description: error instanceof Error ? error.message : "Failed to create watermarked video. Please try again.",
        variant: "error",
      });
    }
  };

  // Poll internal watermark status endpoint every 2 seconds whenever the video
  // list is visible. If the status route reports completed jobs, refresh the videos
  // so any processing/completed states are reflected.
  // Use a ref to access current videos without causing effect re-runs
  const videosRef = useRef(videos);
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    let isCancelled = false;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async () => {
      if (isCancelled) return;

      try {
        const response = await fetch("/api/videos/watermark/status");
        if (!response.ok || isCancelled) return;

        const json = await response.json();
        if (!json.success || !json.data?.jobs || isCancelled) return;

        // Get current videos from ref to avoid stale closure
        const currentVideos = videosRef.current;

        // Update pendingJobs with messages from status polling
        // Match jobs to videos by deriving original key from pathKey
        setPendingJobs((prevPendingJobs) => {
          const updatedPendingJobs: typeof prevPendingJobs = {...prevPendingJobs};
          let hasUpdates = false;

          for (const job of json.data.jobs) {
            // For processing or completed jobs, try to match to a video
            if (job.status === "processing" || job.status === "success" || job.status === "completed") {
              // If we have a pathKey, derive the original key to match the video
              if (job.pathKey) {
                const originalKey = job.pathKey.replace(/-watermarked(\.[^./]+)$/, "$1");
                // Find the video that matches this original key
                const matchingVideo = currentVideos.find((v) => v.original_url === originalKey);
                if (matchingVideo && job.message) {
                  updatedPendingJobs[matchingVideo.id] = {
                    message: job.message,
                  };
                  hasUpdates = true;
                }
              } else if (job.status === "processing" && job.message) {
                // For processing jobs without pathKey yet, match to processing videos
                // If there's only one processing video, update it
                // If multiple, update the one that doesn't have a message yet
                const processingVideos = currentVideos.filter((v) => v.status === "processing");
                if (processingVideos.length === 1) {
                  // Only one processing video - safe to update
                  updatedPendingJobs[processingVideos[0].id] = {
                    message: job.message,
                  };
                  hasUpdates = true;
                } else if (processingVideos.length > 1) {
                  // Multiple processing videos - update the first one without a message
                  // or the first one if all have messages (update with latest)
                  const videoToUpdate = processingVideos.find((v) => !prevPendingJobs[v.id]) || processingVideos[0];
                  if (videoToUpdate) {
                    updatedPendingJobs[videoToUpdate.id] = {
                      message: job.message,
                    };
                    hasUpdates = true;
                  }
                }
              }
            }
          }

          return hasUpdates ? updatedPendingJobs : prevPendingJobs;
        });

        // Check if any jobs are completed or if videos were updated
        const hasCompletedJobs = json.data.hasCompletedJobs ?? false;
        const videosUpdated = json.data.videosUpdated ?? 0;

        // Also check if any videos are currently in "processing" state
        // If so, refresh to check for updates even if no jobs are completed yet
        const hasProcessingVideos = currentVideos.some((v) => v.status === "processing");

        // Refresh if:
        // 1. There are completed jobs (which means videos might have been updated)
        // 2. Videos were actually updated in this poll
        // 3. There are processing videos (to check for status changes)
        if ((hasCompletedJobs || videosUpdated > 0 || hasProcessingVideos) && !isCancelled) {
          console.log("[VideoGrid] Refreshing videos after status poll", {
            hasCompletedJobs,
            videosUpdated,
            hasProcessingVideos,
          });
          onSilentRefresh();
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Error polling watermark status:", error);
        }
      }
    };

    // Initial poll immediately, then every 2 seconds
    void poll();
    intervalId = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      isCancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, [onSilentRefresh]);

  const handleDeleteClick = (video: Video) => {
    setDeleteDialog({
      isOpen: true,
      video,
      isDeleting: false,
    });
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({
      isOpen: false,
      video: null,
      isDeleting: false,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.video) return;

    setDeleteDialog((prev) => ({...prev, isDeleting: true}));

    try {
      const response = await fetch(`/api/videos/${deleteDialog.video.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Video deleted",
          description: `"${deleteDialog.video.filename}" has been deleted successfully.`,
        });

        // Close dialog and refresh the grid
        setDeleteDialog({
          isOpen: false,
          video: null,
          isDeleting: false,
        });

        onRefresh();
      } else {
        throw new Error(data.error?.message || "Failed to delete video");
      }
    } catch (error) {
      console.error("Error deleting video:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete video. Please try again.",
        variant: "error",
      });

      setDeleteDialog((prev) => ({...prev, isDeleting: false}));
    }
  };

  // Empty state when no videos are available
  if (!isLoading && videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-full">
          <UploadIcon className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No videos yet</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          Upload your first video to get started. You can upload MP4, MOV, AVI, or WEBM files up to 500MB.
        </p>
        <Button onClick={onOpenUploadModal}>
          <UploadIcon className="mr-2 h-4 w-4" />
          Upload your first video
        </Button>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-500 dark:text-gray-400">Loading videos...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-gray-800 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-red-500 mb-2">Error loading videos</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">{error}</p>
        <Button onClick={onRefresh} variant="outline">
          <RefreshCwIcon className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  // Debug: Log video data to see what thumbnails are available
  console.log(
    "VideoGrid videos:",
    videos.map((v) => ({
      filename: v.filename,
      hasPreviewThumbnail: !!v.preview_thumbnail_data,
      originalThumbnailUrl: v.original_thumbnail_url,
      status: v.status,
    }))
  );

  // Video pairs grid - responsive flex layout
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-6 justify-start">
        {videos.map((video) => (
          <Card key={video.id} className="overflow-hidden flex-shrink-0 w-fit min-w-0">
            <CardContent className="p-4">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-lg truncate max-w-[450px]" title={video.filename}>
                    {video.filename}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Uploaded {new Date(video.upload_date).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                  onClick={() => handleDeleteClick(video)}
                  title={`Delete "${video.filename}"`}>
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>

              {/* Video pair container */}
              <div className="flex gap-4 justify-start items-start">
                {/* Original video */}
                <div className="space-y-2 flex-shrink-0">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Original</h4>
                  <div
                    className="w-60 max-w-[240px] aspect-video relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => handleVideoClick(video, "original")}>
                    {isOpeningVideo === video.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                        <LoadingSpinner size="sm" />
                      </div>
                    )}
                    {video.preview_thumbnail_data ? (
                      // Using <img> for base64 data URLs is appropriate since Next.js Image component
                      // is designed for external URLs and file paths, not data URLs
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.preview_thumbnail_data}
                        alt={`${video.filename} - Browser Generated Preview`}
                        className="object-cover w-full h-full"
                      />
                    ) : video.original_thumbnail_url &&
                      !video.original_thumbnail_url.includes("placeholder-video-thumbnail") ? (
                      <Image
                        src={video.original_thumbnail_url}
                        alt={`${video.filename} - Server Thumbnail`}
                        className="object-cover"
                        fill
                        sizes="240px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                        <span className="text-gray-400 text-xs">No preview</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Watermarked version */}
                <div className="space-y-2 flex-shrink-0">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Watermarked</h4>
                  <div className="w-60 max-w-[240px] aspect-video relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                    {/* Always-visible icon button to (re)create watermarked version */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-7 w-7 rounded-full bg-white/80 hover:bg-white shadow-sm z-10"
                      title="Create or refresh watermarked version"
                      onClick={() => handleCreateWatermark(video)}>
                      <QrCode className="h-3 w-3" />
                    </Button>

                    {/* Download button - only shown when watermarked version is available */}
                    {video.status === "processed" && video.processed_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 left-1 h-7 w-7 rounded-full bg-white/80 hover:bg-white shadow-sm z-10"
                        title="Download watermarked video"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent triggering video play
                          handleDownloadWatermarked(video);
                        }}>
                        <Download className="h-3 w-3" />
                      </Button>
                    )}

                    {/* Delete watermarked video button - only shown when watermarked version is available */}
                    {video.status === "processed" && video.processed_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute bottom-1 right-1 h-7 w-7 rounded-full bg-white/80 hover:bg-white shadow-sm z-10 text-gray-600 hover:text-red-500"
                        title="Delete watermarked video"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent triggering video play
                          handleDeleteWatermarkedClick(video);
                        }}>
                        <TrashIcon className="h-3 w-3" />
                      </Button>
                    )}

                    {video.status === "processed" &&
                    (video.processed_thumbnail_url ||
                      video.preview_thumbnail_data ||
                      (video.original_thumbnail_url &&
                        !video.original_thumbnail_url.includes("placeholder-video-thumbnail"))) ? (
                      <div
                        className="w-full h-full cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => handleVideoClick(video, "watermarked")}>
                        {video.processed_thumbnail_url ? (
                          <Image
                            src={video.processed_thumbnail_url}
                            alt={`${video.filename} - Watermarked`}
                            className="object-cover"
                            fill
                            sizes="240px"
                          />
                        ) : video.preview_thumbnail_data ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={video.preview_thumbnail_data}
                            alt={`${video.filename} - Watermarked Preview`}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <Image
                            src={video.original_thumbnail_url as string}
                            alt={`${video.filename} - Watermarked`}
                            className="object-cover"
                            fill
                            sizes="240px"
                          />
                        )}
                      </div>
                    ) : video.status === "processing" ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 dark:bg-gray-700 animate-pulse">
                        <LoadingSpinner size="sm" />
                        <span className="text-black dark:text-black text-xs mt-2 text-center px-2">
                          {(() => {
                            const message = pendingJobs[video.id]?.message ?? "Processing...";
                            return message.length > 32 ? `${message.substring(0, 32)}...` : message;
                          })()}
                        </span>
                      </div>
                    ) : video.status === "failed" ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/20">
                        <span className="text-red-500 text-xs text-center">Processing failed</span>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 dark:bg-gray-700">
                        <span className="text-gray-400 text-xs text-center mb-2">No watermarked version</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        videoFilename={deleteDialog.video?.filename || ""}
        isDeleting={deleteDialog.isDeleting}
      />

      {/* Delete watermarked video confirmation dialog */}
      <DeleteWatermarkedConfirmDialog
        isOpen={deleteWatermarkedDialog.isOpen}
        onClose={handleDeleteWatermarkedCancel}
        onConfirm={handleDeleteWatermarkedConfirm}
        videoFilename={deleteWatermarkedDialog.video?.filename || ""}
        isDeleting={deleteWatermarkedDialog.isDeleting}
      />

      {/* Watermark start notification */}
      <WatermarkStartNotification
        isOpen={watermarkStartNotification.isOpen}
        onClose={() => setWatermarkStartNotification({ isOpen: false, videoFilename: "" })}
        videoFilename={watermarkStartNotification.videoFilename}
      />

      {/* Video player */}
      {videoPlayer.videoUrl && (
        <VideoPlayer
          videoUrl={videoPlayer.videoUrl}
          videoId={videoPlayer.videoId}
          onClose={handleClosePlayer}
          isOpen={videoPlayer.isOpen}
          enableFrameAnalysis={videoPlayer.enableFrameAnalysis}
          verificationStatus={videoPlayer.verificationStatus}
          verifiedUserId={videoPlayer.verifiedUserId}
        />
      )}
    </div>
  );
}
