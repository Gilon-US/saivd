'use client';

import {useRouter} from "next/navigation";
import {MediaUploader, MediaUploadResult} from "@/components/media/MediaUploader";
import type {ImageBatchUploadResult} from "@/hooks/useImageUpload";
import {Button} from "@/components/ui/button";
import {ArrowLeftIcon} from "lucide-react";
import {useToast} from "@/hooks/useToast";

export default function UploadPage() {
  const router = useRouter();
  const {toast} = useToast();

  const handleUploadComplete = (result: MediaUploadResult) => {
    if (result.kind !== "video") return;
    toast({
      title: "Upload complete",
      description: `${result.result.filename} has been uploaded successfully.`,
      variant: "success",
    });
    router.replace("/dashboard/videos");
  };

  const handleImageBatchComplete = (_result: ImageBatchUploadResult) => {
    router.replace("/dashboard/images");
  };

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeftIcon className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold ml-2">Upload Media</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Select a video or image</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Upload one video, or up to 100 images per batch. Videos go through watermark processing; images are
          watermarked on upload.
        </p>

        <MediaUploader
          onUploadComplete={handleUploadComplete}
          onImageBatchComplete={handleImageBatchComplete}
        />
      </div>
    </div>
  );
}
