"use client";

import {useState} from "react";
import FileUploader from "@/components/FileUploader";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Progress} from "@/components/ui/progress";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {useImageUpload, ImageUploadResult, ImageUploadPhase} from "@/hooks/useImageUpload";
import {UploadIcon, CheckCircleIcon, AlertCircleIcon, ImageIcon} from "lucide-react";

type ImageUploaderProps = {
  onUploadComplete?: (result: ImageUploadResult) => void;
  className?: string;
};

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/heic": [".heic"],
  "image/tiff": [".tiff", ".tif"],
};

function getPhaseMessage(phase: ImageUploadPhase): string {
  switch (phase) {
    case "requesting-url": return "Requesting upload URL…";
    case "uploading":      return "Uploading image…";
    case "confirming":     return "Finalizing upload…";
    case "complete":       return "Upload complete!";
    case "error":          return "Upload failed";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export function ImageUploader({onUploadComplete, className = ""}: ImageUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {uploadImage, cancelUpload, clearUpload, uploads} = useImageUpload();

  const currentUpload =
    Object.values(uploads).find((u) => u.uploading) ??
    Object.values(uploads).find((u) => u.phase === "error") ??
    Object.values(uploads).find((u) => u.phase === "complete") ??
    null;
  const uploading = currentUpload?.uploading ?? false;

  const handleFilesSelected = (files: File[]) => {
    const file = files[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setError(null);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleUpload = async () => {
    if (!selectedFile || uploading) return;
    setError(null);
    try {
      const result = await uploadImage(selectedFile);
      onUploadComplete?.(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message ?? "Upload failed");
      }
    }
  };

  const handleDismissError = () => {
    if (currentUpload?.phase === "error") {
      clearUpload(currentUpload.id);
      setError(null);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <FileUploader
        accept={ACCEPTED_TYPES}
        maxSize={10 * 1024 * 1024}
        onFilesSelected={handleFilesSelected}
      />

      {/* Preview */}
      {previewUrl && selectedFile && !uploading && currentUpload?.phase !== "complete" && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-2">Preview</h3>
            <div className="relative w-full max-h-64 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              {selectedFile.type === "image/gif" || !selectedFile.type.startsWith("image/") ? (
                <div className="flex flex-col items-center p-8 text-gray-400">
                  <ImageIcon className="w-12 h-12 mb-2" />
                  <span className="text-sm">{selectedFile.name}</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-64 max-w-full object-contain rounded-md"
                />
              )}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {selectedFile.name} · {formatFileSize(selectedFile.size)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upload action */}
      {selectedFile && !currentUpload && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => {setSelectedFile(null); setPreviewUrl(null);}} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading}>
            <UploadIcon className="mr-2 h-4 w-4" />
            Upload Image
          </Button>
        </div>
      )}

      {/* Progress card */}
      {currentUpload && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              {currentUpload.phase === "complete" ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
              ) : currentUpload.phase === "error" ? (
                <AlertCircleIcon className="h-5 w-5 text-red-500" />
              ) : (
                <LoadingSpinner size="sm" />
              )}
              <div className="flex-1">
                <p className="font-medium text-sm">{getPhaseMessage(currentUpload.phase)}</p>
                <p className="text-xs text-gray-500 truncate">{currentUpload.file.name}</p>
              </div>
            </div>

            {currentUpload.phase === "error" && currentUpload.error && (
              <p className="text-sm text-destructive">{currentUpload.error.message}</p>
            )}

            {currentUpload.phase === "uploading" && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{currentUpload.progress}%</span>
                  {currentUpload.bytesUploaded != null && currentUpload.totalBytes != null && (
                    <span>{formatFileSize(currentUpload.bytesUploaded)} / {formatFileSize(currentUpload.totalBytes)}</span>
                  )}
                </div>
                <Progress value={currentUpload.progress} className="h-2" />
              </div>
            )}

            {currentUpload.phase !== "uploading" && currentUpload.phase !== "complete" && currentUpload.phase !== "error" && (
              <Progress value={null} className="h-2" />
            )}

            {currentUpload.uploading && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => cancelUpload(currentUpload.id)}>
                  Cancel
                </Button>
              </div>
            )}
            {currentUpload.phase === "error" && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleDismissError}>Try again</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
