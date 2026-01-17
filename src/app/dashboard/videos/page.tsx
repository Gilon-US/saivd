"use client";

import {useState} from "react";
import {Button} from "@/components/ui/button";
import {VideoGrid} from "@/components/video/VideoGrid";
import {UploadModal} from "@/components/video/UploadModal";
import {useVideos} from "@/hooks/useVideos";
import {useToast} from "@/hooks/useToast";
import {UploadIcon, RefreshCwIcon} from "lucide-react";
import {UploadResult} from "@/hooks/useVideoUpload";

export default function VideosPage() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const {videos, isLoading, error, refresh, refreshSilently} = useVideos();
  const {toast} = useToast();

  const handleOpenUploadModal = () => {
    setIsUploadModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    setIsUploadModalOpen(false);
  };

  const handleUploadComplete = (result: UploadResult) => {
    toast({
      title: "Upload complete",
      description: `${result.filename} has been uploaded successfully.`,
      variant: "success",
    });

    // Refresh the video list after a short delay to ensure the new video is included
    setTimeout(() => {
      refresh();
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Videos</h1>
          <p className="text-gray-500 dark:text-gray-400">View and manage your uploaded videos</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCwIcon className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenUploadModal}>
            <UploadIcon className="h-4 w-4 mr-2" />
            Upload Video
          </Button>
        </div>
      </div>

      <VideoGrid
        videos={videos}
        isLoading={isLoading}
        error={error}
        onRefresh={refresh}
        onSilentRefresh={refreshSilently}
        onOpenUploadModal={handleOpenUploadModal}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={handleCloseUploadModal}
        onUploadComplete={handleUploadComplete}
        existingVideos={videos}
      />
    </div>
  );
}
