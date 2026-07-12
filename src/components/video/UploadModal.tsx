'use client';

import { MediaUploader, MediaUploadResult } from '@/components/media/MediaUploader';
import { Video } from '@/components/video/VideoUploader';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';
import type { ImageBatchUploadResult } from '@/hooks/useImageUpload';
import type { VideoBatchUploadResult } from '@/hooks/useVideoUpload';

type UploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (result: MediaUploadResult) => void;
  onImageBatchComplete?: (result: ImageBatchUploadResult) => void;
  onVideoBatchComplete?: (result: VideoBatchUploadResult) => void;
  existingVideos?: Video[];
};

export function UploadModal({
  isOpen,
  onClose,
  onUploadComplete,
  onImageBatchComplete,
  onVideoBatchComplete,
  existingVideos = [],
}: UploadModalProps) {
  const handleUploadComplete = (result: MediaUploadResult) => {
    onUploadComplete(result);
    onClose();
  };

  const handleImageBatchComplete = (result: ImageBatchUploadResult) => {
    onImageBatchComplete?.(result);
    if (result.succeeded.length !== 1 || result.failed.length > 0) {
      onClose();
    }
  };

  const handleVideoBatchComplete = (result: VideoBatchUploadResult) => {
    onVideoBatchComplete?.(result);
    if (result.succeeded.length !== 1 || result.failed.length > 0) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">Upload Media</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Upload up to 5 videos (one at a time) or up to 100 images per batch. Videos are processed for
              watermarking; images are watermarked on upload. Limits are configured in Settings → General.
            </p>
            <MediaUploader
              onUploadComplete={handleUploadComplete}
              onImageBatchComplete={handleImageBatchComplete}
              onVideoBatchComplete={handleVideoBatchComplete}
              existingVideos={existingVideos}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
