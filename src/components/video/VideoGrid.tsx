"use client";
import {Card, CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {UploadIcon, RefreshCwIcon, TrashIcon} from "lucide-react";
import Image from "next/image";
import {useToast} from "@/hooks/useToast";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {DeleteConfirmDialog} from "./DeleteConfirmDialog";
import {VideoPlayer} from "./VideoPlayer";
import {useState, useEffect} from "react";

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

  const [videoPlayer, setVideoPlayer] = useState<{
    isOpen: boolean;
    videoUrl: string | null;
  }>({
    isOpen: false,
    videoUrl: null,
  });

  const [isOpeningVideo, setIsOpeningVideo] = useState<string | null>(null);

  const handleVideoClick = async (video: Video) => {
    try {
      setIsOpeningVideo(video.id);
      const response = await fetch(`/api/videos/${video.id}/play`);
      const data = await response.json();
      if (!response.ok || !data.success || !data.data?.playbackUrl) {
        throw new Error(data.error?.message || "Failed to generate playback URL");
      }
      setVideoPlayer({
        isOpen: true,
        videoUrl: data.data.playbackUrl,
      });
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
    setVideoPlayer({
      isOpen: false,
      videoUrl: null,
    });
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

      toast({
        title: "Watermark job started",
        description: `Watermarking has started for "${video.filename}".`,
        variant: "success",
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

  // Poll internal watermark status endpoint every 5 seconds whenever the video
  // list is visible. If the status route reports jobs, refresh the videos so
  // any processing/completed states are reflected.
  useEffect(() => {
    let isCancelled = false;

    const poll = async () => {
      try {
        const response = await fetch("/api/videos/watermark/status");
        if (!response.ok) return;

        const json = await response.json();
        if (!json.success || !json.data?.jobs) return;

        if (!isCancelled) {
          onSilentRefresh();
        }
      } catch (error) {
        console.error("Error polling watermark status:", error);
      }
    };

    // Initial poll immediately, then every 5 seconds
    void poll();
    const intervalId = setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
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
                    onClick={() => handleVideoClick(video)}>
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
                      <UploadIcon className="h-3 w-3" />
                    </Button>

                    {video.status === "processed" &&
                    (video.processed_thumbnail_url ||
                      video.preview_thumbnail_data ||
                      (video.original_thumbnail_url &&
                        !video.original_thumbnail_url.includes("placeholder-video-thumbnail"))) ? (
                      <div
                        className="w-full h-full cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => handleVideoClick(video)}>
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
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 dark:bg-gray-700">
                        <LoadingSpinner size="sm" />
                        <span className="text-gray-400 text-xs mt-2">
                          {pendingJobs[video.id]?.message ?? "Processing..."}
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

      {/* Video player */}
      {videoPlayer.videoUrl && (
        <VideoPlayer videoUrl={videoPlayer.videoUrl} onClose={handleClosePlayer} isOpen={videoPlayer.isOpen} />
      )}
    </div>
  );
}
