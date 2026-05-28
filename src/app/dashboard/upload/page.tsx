'use client';

import {useRouter} from "next/navigation";
import Link from "next/link";
import {MediaUploader, MediaUploadResult} from "@/components/media/MediaUploader";
import {Button} from "@/components/ui/button";
import {ArrowLeftIcon} from "lucide-react";
import {useToast} from "@/hooks/useToast";

export default function UploadPage() {
  const router = useRouter();
  const {toast} = useToast();

  const handleUploadComplete = (result: MediaUploadResult) => {
    if (result.kind === "video") {
      toast({
        title: "Upload complete",
        description: `${result.result.filename} has been uploaded successfully.`,
        variant: "success",
      });
      router.replace("/dashboard/videos");
      return;
    }

    toast({
      title: "Image uploaded",
      description: (
        <span>
          {result.result.filename} uploaded.{" "}
          <Link href="/dashboard/images" className="underline font-medium">
            View in Images
          </Link>
        </span>
      ),
      variant: "success",
    });
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
          Videos go through watermark processing. Images are stored as uploaded with no preprocessing.
        </p>

        <MediaUploader onUploadComplete={handleUploadComplete} />
      </div>
    </div>
  );
}
