'use client';

import { useState } from 'react';
import { VideoUploader, Video } from '@/components/video/VideoUploader';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';
import { UploadResult } from '@/hooks/useVideoUpload';

type UploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (result: UploadResult) => void;
  existingVideos?: Video[];
};

export function UploadModal({ isOpen, onClose, onUploadComplete, existingVideos = [] }: UploadModalProps) {
  const [uploadComplete, setUploadComplete] = useState(false);
  
  const handleUploadComplete = (result: UploadResult) => {
    setUploadComplete(true);
    onUploadComplete(result);
  };
  
  const handleClose = () => {
    setUploadComplete(false);
    onClose();
  };
  
  if (!isOpen) {
    return null;
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">
            {uploadComplete ? 'Upload Complete' : 'Upload Video'}
          </h2>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <XIcon className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="p-6">
          {!uploadComplete ? (
            <div className="space-y-4">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Select a video to upload. Supported formats: MP4, MOV, AVI, WEBM. Maximum file size: 500MB.
              </p>
              <VideoUploader onUploadComplete={handleUploadComplete} existingVideos={existingVideos} />
            </div>
          ) : (
            <div className="text-center py-4">
              <h3 className="text-lg font-medium text-green-600 mb-2">Upload Successful!</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Your video has been uploaded successfully and will appear in your video grid.
              </p>
              <div className="flex justify-center space-x-4">
                <Button variant="outline" onClick={() => {
                  setUploadComplete(false);
                }}>
                  Upload Another Video
                </Button>
                <Button onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
