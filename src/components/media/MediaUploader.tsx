"use client";

import {useState, useEffect, useMemo} from "react";
import FileUploader from "@/components/FileUploader";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Progress} from "@/components/ui/progress";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {useVideoUpload, UploadResult, UploadPhase} from "@/hooks/useVideoUpload";
import {useImageUpload, ImageUploadResult, ImageUploadPhase} from "@/hooks/useImageUpload";
import {UploadIcon, CheckCircleIcon, AlertCircleIcon, ImageIcon} from "lucide-react";
import type {Video} from "@/components/video/VideoUploader";

export type MediaUploadResult =
  | {kind: "video"; result: UploadResult}
  | {kind: "image"; result: ImageUploadResult};

type MediaUploaderProps = {
  onUploadComplete?: (result: MediaUploadResult) => void;
  className?: string;
  existingVideos?: Video[];
};

type MediaKind = "video" | "image";

type UploadLimits = {
  video: {maxSizeBytes: number; allowedTypes: string[]};
  image: {maxSizeBytes: number; allowedTypes: string[]};
};

const DEFAULT_LIMITS: UploadLimits = {
  video: {maxSizeBytes: 500 * 1024 * 1024, allowedTypes: ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"]},
  image: {maxSizeBytes: 10 * 1024 * 1024, allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"]},
};

function buildAcceptMap(videoTypes: string[], imageTypes: string[]) {
  const accept: Record<string, string[]> = {};
  for (const mime of videoTypes) {
    const ext = mime.split("/")[1];
    accept[mime] = ext ? [`.${ext}`] : [];
  }
  for (const mime of imageTypes) {
    const ext = mime.split("/")[1];
    if (!accept[mime]) accept[mime] = ext ? [`.${ext}`] : [];
  }
  return accept;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function getVideoPhaseMessage(phase: UploadPhase): string {
  switch (phase) {
    case "preparing": return "Preparing video…";
    case "requesting-url": return "Requesting upload URL…";
    case "uploading": return "Uploading video…";
    case "confirming": return "Finalizing upload…";
    case "complete": return "Upload complete!";
    case "error": return "Upload failed";
    default: return "Processing…";
  }
}

function getImagePhaseMessage(phase: ImageUploadPhase): string {
  switch (phase) {
    case "requesting-url": return "Requesting upload URL…";
    case "uploading": return "Uploading image…";
    case "confirming": return "Finalizing upload…";
    case "complete": return "Upload complete!";
    case "error": return "Upload failed";
  }
}

export function MediaUploader({onUploadComplete, className = "", existingVideos = []}: MediaUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<UploadLimits>(DEFAULT_LIMITS);

  const {uploadVideo, cancelUpload: cancelVideoUpload, clearUpload: clearVideoUpload, uploads: videoUploads} =
    useVideoUpload();
  const {uploadImage, cancelUpload: cancelImageUpload, clearUpload: clearImageUpload, uploads: imageUploads} =
    useImageUpload();

  useEffect(() => {
    fetch("/api/media/upload/limits")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setLimits(json.data as UploadLimits);
        }
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  const currentVideoUpload =
    Object.values(videoUploads).find((u) => u.uploading) ??
    Object.values(videoUploads).find((u) => u.phase === "error") ??
    Object.values(videoUploads).find((u) => u.phase === "complete") ??
    null;

  const currentImageUpload =
    Object.values(imageUploads).find((u) => u.uploading) ??
    Object.values(imageUploads).find((u) => u.phase === "error") ??
    Object.values(imageUploads).find((u) => u.phase === "complete") ??
    null;

  const uploading = (currentVideoUpload?.uploading ?? false) || (currentImageUpload?.uploading ?? false);

  const acceptMap = useMemo(
    () => buildAcceptMap(limits.video.allowedTypes, limits.image.allowedTypes),
    [limits]
  );

  const maxDropzoneSize = Math.max(limits.video.maxSizeBytes, limits.image.maxSizeBytes);

  const hasDuplicateFilename =
    mediaKind === "video" && selectedFile
      ? existingVideos.some((v) => v.filename === selectedFile.name)
      : false;

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const detectKind = (file: File): MediaKind | null => {
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "image";
    return null;
  };

  const handleFilesSelected = (files: File[]) => {
    const file = files[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      setMediaKind(null);
      setError(null);
      return;
    }

    const kind = detectKind(file);
    if (!kind) {
      setError("Unsupported file type. Please select a video or image file.");
      setSelectedFile(null);
      setMediaKind(null);
      return;
    }

    const maxBytes = kind === "video" ? limits.video.maxSizeBytes : limits.image.maxSizeBytes;
    if (file.size > maxBytes) {
      setError(`File is too large. Maximum size for ${kind}s is ${Math.round(maxBytes / (1024 * 1024))} MB.`);
      setSelectedFile(null);
      setMediaKind(null);
      return;
    }

    const allowed = kind === "video" ? limits.video.allowedTypes : limits.image.allowedTypes;
    if (!allowed.includes(file.type)) {
      setError(`This ${kind} type is not allowed. Check Settings → General for allowed formats.`);
      setSelectedFile(null);
      setMediaKind(null);
      return;
    }

    setSelectedFile(file);
    setMediaKind(kind);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !mediaKind || uploading || hasDuplicateFilename) return;
    setError(null);

    try {
      if (mediaKind === "video") {
        const result = await uploadVideo(selectedFile);
        onUploadComplete?.({kind: "video", result});
      } else {
        const result = await uploadImage(selectedFile);
        onUploadComplete?.({kind: "image", result});
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message || "An error occurred during upload");
      }
    }
  };

  const handleCancelUpload = () => {
    if (currentVideoUpload?.uploading) cancelVideoUpload(currentVideoUpload.id);
    if (currentImageUpload?.uploading) cancelImageUpload(currentImageUpload.id);
  };

  const handleDismissError = () => {
    if (currentVideoUpload?.phase === "error") {
      clearVideoUpload(currentVideoUpload.id);
      setError(null);
    }
    if (currentImageUpload?.phase === "error") {
      clearImageUpload(currentImageUpload.id);
      setError(null);
    }
  };

  const activeUpload = currentVideoUpload ?? currentImageUpload;
  const isVideoUpload = !!currentVideoUpload;

  return (
    <div className={`space-y-6 ${className}`}>
      <FileUploader
        accept={acceptMap}
        maxSize={maxDropzoneSize}
        invalidTypeMessage="Invalid file type. Please upload a video or image file."
        onFilesSelected={handleFilesSelected}
      />

      {previewUrl && selectedFile && mediaKind && !uploading && !activeUpload && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-2">{mediaKind === "video" ? "Video Preview" : "Image Preview"}</h3>
            {mediaKind === "video" ? (
              <div className="aspect-video relative overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                <video controls className="w-full h-full object-contain" src={previewUrl}>
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : (
              <div className="relative max-h-64 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Preview" className="max-h-64 max-w-full object-contain rounded-md" />
              </div>
            )}
            <div className="mt-2 text-sm text-gray-500 flex items-center gap-2">
              {mediaKind === "image" && <ImageIcon className="h-4 w-4" />}
              {selectedFile.name} ({formatFileSize(selectedFile.size)})
              <span className="text-xs uppercase tracking-wide text-gray-400">{mediaKind}</span>
            </div>
            {mediaKind === "image" && (
              <p className="mt-2 text-xs text-gray-500">
                Images are stored as uploaded — no preprocessing or watermarking.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {selectedFile && !activeUpload && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSelectedFile(null);
              setMediaKind(null);
            }}
            disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || hasDuplicateFilename}>
            {uploading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Uploading…
              </>
            ) : (
              <>
                <UploadIcon className="mr-2 h-4 w-4" />
                Upload Now
              </>
            )}
          </Button>
        </div>
      )}

      {activeUpload && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              {activeUpload.phase === "complete" ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
              ) : activeUpload.phase === "error" ? (
                <AlertCircleIcon className="h-5 w-5 text-red-500" />
              ) : (
                <LoadingSpinner size="sm" />
              )}
              <div className="flex-1">
                <p className="font-medium text-sm">
                  {isVideoUpload
                    ? getVideoPhaseMessage(activeUpload.phase as UploadPhase)
                    : getImagePhaseMessage(activeUpload.phase as ImageUploadPhase)}
                </p>
                <p className="text-xs text-gray-500 truncate">{activeUpload.file.name}</p>
              </div>
            </div>

            {activeUpload.phase === "error" && activeUpload.error && (
              <p className="text-sm text-destructive">{activeUpload.error.message}</p>
            )}

            {(activeUpload.phase === "uploading" || activeUpload.progress > 0) && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>{activeUpload.progress}%</span>
                  {activeUpload.bytesUploaded != null && activeUpload.totalBytes != null && (
                    <span>
                      {formatFileSize(activeUpload.bytesUploaded)} / {formatFileSize(activeUpload.totalBytes)}
                    </span>
                  )}
                </div>
                <Progress value={activeUpload.progress} className="h-2" />
              </div>
            )}

            {activeUpload.phase !== "uploading" &&
              activeUpload.progress === 0 &&
              activeUpload.phase !== "complete" &&
              activeUpload.phase !== "error" && <Progress value={null} className="h-2" />}

            {activeUpload.phase !== "complete" && activeUpload.phase !== "error" && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleCancelUpload}>
                  Cancel Upload
                </Button>
              </div>
            )}

            {activeUpload.phase === "error" && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleDismissError}>
                  Try again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasDuplicateFilename && selectedFile && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>
            A video named <strong>&ldquo;{selectedFile.name}&rdquo;</strong> already exists. Rename the file or choose
            another.
          </AlertDescription>
        </Alert>
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
