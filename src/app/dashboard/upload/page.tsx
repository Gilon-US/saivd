'use client';

import { useRouter } from 'next/navigation';
import { VideoUploader } from '@/components/video/VideoUploader';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon } from 'lucide-react';
import { UploadResult } from '@/hooks/useVideoUpload';
import { useToast } from '@/hooks/useToast';

export default function UploadPage() {
  const router = useRouter();
  const { toast } = useToast();

  const handleUploadComplete = (result: UploadResult) => {
    toast({
      title: 'Upload complete',
      description: `${result.filename} has been uploaded successfully.`,
      variant: 'success',
    });
    router.replace('/dashboard/videos');
  };

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeftIcon className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold ml-2">Upload Video</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Select a video to upload</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Supported formats: MP4, MOV, AVI, WEBM. Maximum file size: 500MB.
        </p>

        <VideoUploader onUploadComplete={handleUploadComplete} />
      </div>
    </div>
  );
}
