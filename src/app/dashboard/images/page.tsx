"use client";

import {useState} from "react";
import {Button} from "@/components/ui/button";
import {ImageGrid} from "@/components/image/ImageGrid";
import {ImageUploader} from "@/components/image/ImageUploader";
import {useImages} from "@/hooks/useImages";
import {useToast} from "@/hooks/useToast";
import {UploadIcon, RefreshCwIcon, XIcon} from "lucide-react";
import type {ImageUploadResult, ImageBatchUploadResult} from "@/hooks/useImageUpload";

export default function ImagesPage() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const {images, isLoading, error, refresh, deleteImage} = useImages();
  const {toast} = useToast();

  const handleUploadComplete = (_result: ImageUploadResult) => {
    // Single-file uploads still supported; batch flow uses onBatchComplete.
  };

  const handleBatchComplete = (_result: ImageBatchUploadResult) => {
    setTimeout(() => refresh(), 800);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Images</h1>
          <p className="text-gray-500 dark:text-gray-400">Upload and manage your images</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCwIcon className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setIsUploadOpen((v) => !v)}>
            {isUploadOpen ? (
              <><XIcon className="h-4 w-4 mr-2" />Cancel</>
            ) : (
              <><UploadIcon className="h-4 w-4 mr-2" />Upload Images</>
            )}
          </Button>
        </div>
      </div>

      {/* Inline upload panel */}
      {isUploadOpen && (
        <div className="border rounded-lg p-6 bg-white dark:bg-gray-800 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Upload Images</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Select up to 100 images per batch. Supported formats: JPEG, PNG, WebP, GIF, HEIC, TIFF.
            Maximum size per file is set in Settings → General.
          </p>
          <ImageUploader onUploadComplete={handleUploadComplete} onBatchComplete={handleBatchComplete} />
        </div>
      )}

      <ImageGrid
        images={images}
        isLoading={isLoading}
        error={error}
        onRefresh={refresh}
        onOpenUploadModal={() => setIsUploadOpen(true)}
        onDelete={async (id) => {
          await deleteImage(id);
          toast({title: "Image deleted", variant: "success"});
        }}
      />
    </div>
  );
}
