'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VideoUploader } from '@/components/video/VideoUploader';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon } from 'lucide-react';
import { UploadResult } from '@/hooks/useVideoUpload';

export default function UploadPage() {
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const router = useRouter();
  
  const handleUploadComplete = (result: UploadResult) => {
    setUploadResult(result);
    setUploadComplete(true);
  };
  
  const handleViewVideos = () => {
    router.push('/dashboard/videos');
  };
  
  const handleUploadAnother = () => {
    setUploadComplete(false);
    setUploadResult(null);
  };

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeftIcon className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold ml-2">Upload Video</h1>
      </div>
      
      {!uploadComplete ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Select a video to upload</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Supported formats: MP4, MOV, AVI, WEBM. Maximum file size: 500MB.
          </p>
          
          <VideoUploader onUploadComplete={handleUploadComplete} />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-green-600 mb-2">Upload Complete!</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Your video has been successfully uploaded. You can now view it in your video library.
            </p>
            {uploadResult && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-left">
                <h3 className="font-medium mb-2">Video Details</h3>
                <p className="text-sm">
                  <span className="font-medium">Name:</span> {uploadResult.filename}
                </p>
                <p className="text-sm">
                  <span className="font-medium">URL:</span> {uploadResult.originalUrl}
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-center space-x-4">
            <Button variant="outline" onClick={handleUploadAnother}>
              Upload Another Video
            </Button>
            <Button onClick={handleViewVideos}>
              View My Videos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
