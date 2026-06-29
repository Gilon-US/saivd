"use client";

import {useState, useEffect, useMemo} from "react";
import {v4 as uuidv4} from "uuid";
import FileUploader from "@/components/FileUploader";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Progress} from "@/components/ui/progress";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {useVideoUpload, UploadResult, UploadPhase} from "@/hooks/useVideoUpload";
import {
  useImageUpload,
  ImageUploadResult,
  ImageUploadPhase,
  ImageBatchUploadResult,
} from "@/hooks/useImageUpload";
import {UploadIcon, CheckCircleIcon, AlertCircleIcon, ImageIcon} from "lucide-react";
import type {Video} from "@/components/video/VideoUploader";

export type MediaUploadResult =
  | {kind: "video"; result: UploadResult}
  | {kind: "image"; result: ImageUploadResult};

type MediaUploaderProps = {
  onUploadComplete?: (result: MediaUploadResult) => void;
  onImageBatchComplete?: (result: ImageBatchUploadResult) => void;
  className?: string;
  existingVideos?: Video[];
};

type MediaKind = "video" | "image";

type UploadLimits = {
  video: {maxSizeBytes: number; allowedTypes: string[]};
  image: {maxSizeBytes: number; allowedTypes: string[]; maxBatchUpload: number};
};

const DEFAULT_LIMITS: UploadLimits = {
  video: {maxSizeBytes: 500 * 1024 * 1024, allowedTypes: ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"]},
  image: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBatchUpload: 100,
  },
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
    case "uploading": return "Uploading…";
    case "confirming": return "Finalizing…";
    case "complete": return "Complete";
    case "error": return "Failed";
  }
}

function detectKind(file: File): MediaKind | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

export function MediaUploader({
  onUploadComplete,
  onImageBatchComplete,
  className = "",
  existingVideos = [],
}: MediaUploaderProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<UploadLimits>(DEFAULT_LIMITS);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<ImageBatchUploadResult | null>(null);

  const {uploadVideo, cancelUpload: cancelVideoUpload, clearUpload: clearVideoUpload, uploads: videoUploads} =
    useVideoUpload();
  const {
    uploadImages,
    cancelUpload: cancelImageUpload,
    clearBatch,
    uploads: imageUploads,
  } = useImageUpload();

  useEffect(() => {
    fetch("/api/media/upload/limits")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const data = json.data as {
            video: UploadLimits["video"];
            image: UploadLimits["image"] & {maxBatchUpload?: number};
          };
          setLimits({
            video: data.video,
            image: {
              ...data.image,
              maxBatchUpload: data.image.maxBatchUpload ?? DEFAULT_LIMITS.image.maxBatchUpload,
            },
          });
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

  const batchUploads = useMemo(() => {
    if (!activeBatchId) return [];
    return Object.values(imageUploads)
      .filter((u) => u.batchId === activeBatchId)
      .sort((a, b) => a.file.name.localeCompare(b.file.name));
  }, [imageUploads, activeBatchId]);

  const batchComplete =
    batchResult !== null ||
    (batchUploads.length > 0 &&
      batchUploads.every((u) => u.phase === "complete" || u.phase === "error") &&
      !batchRunning);

  const videoUploading = currentVideoUpload?.uploading ?? false;
  const uploading = videoUploading || batchRunning;

  const acceptMap = useMemo(
    () => buildAcceptMap(limits.video.allowedTypes, limits.image.allowedTypes),
    [limits]
  );

  const maxDropzoneSize = Math.max(limits.video.maxSizeBytes, limits.image.maxSizeBytes);
  const selectedVideo = mediaKind === "video" ? (selectedFiles[0] ?? null) : null;

  const hasDuplicateFilename =
    mediaKind === "video" && selectedVideo
      ? existingVideos.some((v) => v.filename === selectedVideo.name)
      : false;

  useEffect(() => {
    if (!selectedVideo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedVideo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedVideo]);

  const handleFilesSelected = (files: File[]) => {
    if (batchRunning || videoUploading) return;

    if (files.length === 0) {
      setSelectedFiles([]);
      setMediaKind(null);
      setError(null);
      setBatchResult(null);
      setActiveBatchId(null);
      return;
    }

    const kinds = files.map(detectKind);
    if (kinds.some((k) => k === null)) {
      setError("Unsupported file type. Please select video or image files only.");
      setSelectedFiles([]);
      setMediaKind(null);
      return;
    }

    const hasVideo = kinds.includes("video");
    const hasImage = kinds.includes("image");

    if (hasVideo && hasImage) {
      setError("Cannot mix videos and images in one upload. Select only videos or only images.");
      setSelectedFiles([]);
      setMediaKind(null);
      return;
    }

    if (hasVideo && files.length > 1) {
      setError("Only one video can be uploaded at a time.");
      setSelectedFiles([]);
      setMediaKind(null);
      return;
    }

    if (hasImage && files.length > limits.image.maxBatchUpload) {
      setError(`Too many images. Maximum is ${limits.image.maxBatchUpload} per batch.`);
      setSelectedFiles(files.slice(0, limits.image.maxBatchUpload));
      setMediaKind("image");
      return;
    }

    const kind: MediaKind = hasVideo ? "video" : "image";
    const maxBytes = kind === "video" ? limits.video.maxSizeBytes : limits.image.maxSizeBytes;
    const allowed = kind === "video" ? limits.video.allowedTypes : limits.image.allowedTypes;

    for (const file of files) {
      if (file.size > maxBytes) {
        setError(
          `"${file.name}" is too large. Maximum size for ${kind}s is ${Math.round(maxBytes / (1024 * 1024))} MB.`
        );
        setSelectedFiles([]);
        setMediaKind(null);
        return;
      }
      if (!allowed.includes(file.type)) {
        setError(`"${file.name}" is not an allowed ${kind} type. Check Settings → General.`);
        setSelectedFiles([]);
        setMediaKind(null);
        return;
      }
    }

    setSelectedFiles(files);
    setMediaKind(kind);
    setError(null);
    setBatchResult(null);
    setActiveBatchId(null);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !mediaKind || uploading || hasDuplicateFilename) return;
    setError(null);

    try {
      if (mediaKind === "video") {
        const result = await uploadVideo(selectedFiles[0]);
        onUploadComplete?.({kind: "video", result});
        return;
      }

      setBatchRunning(true);
      setBatchResult(null);
      const batchId = uuidv4();
      setActiveBatchId(batchId);

      const result = await uploadImages(selectedFiles, {
        maxBatch: limits.image.maxBatchUpload,
        concurrency: 2,
        batchId,
      });

      setBatchResult(result);
      setSelectedFiles([]);

      onImageBatchComplete?.(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message || "An error occurred during upload");
      }
    } finally {
      setBatchRunning(false);
    }
  };

  const handleBatchDone = () => {
    if (activeBatchId) clearBatch(activeBatchId);
    setActiveBatchId(null);
    setBatchResult(null);
    setSelectedFiles([]);
    setMediaKind(null);
    setError(null);
  };

  const handleCancelVideoUpload = () => {
    if (currentVideoUpload?.uploading) cancelVideoUpload(currentVideoUpload.id);
  };

  const handleDismissVideoError = () => {
    if (currentVideoUpload?.phase === "error") {
      clearVideoUpload(currentVideoUpload.id);
      setError(null);
    }
  };

  const completedCount = batchResult?.succeeded.length ?? batchUploads.filter((u) => u.phase === "complete").length;
  const failedCount = batchResult?.failed.length ?? batchUploads.filter((u) => u.phase === "error").length;
  const totalCount = batchResult
    ? batchResult.succeeded.length + batchResult.failed.length
    : batchUploads.length;

  const showDropzone = !batchComplete && !currentVideoUpload;
  const showSelection = selectedFiles.length > 0 && !uploading && !batchComplete && !currentVideoUpload;

  return (
    <div className={`space-y-6 ${className}`}>
      {showDropzone && (
        <FileUploader
          accept={acceptMap}
          maxSize={maxDropzoneSize}
          maxFiles={limits.image.maxBatchUpload}
          invalidTypeMessage="Invalid file type. Please upload a video or image file."
          onFilesSelected={handleFilesSelected}
        />
      )}

      {previewUrl && selectedVideo && !uploading && !currentVideoUpload && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-2">Video Preview</h3>
            <div className="aspect-video relative overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
              <video controls className="w-full h-full object-contain" src={previewUrl}>
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {selectedVideo.name} ({formatFileSize(selectedVideo.size)})
            </div>
          </CardContent>
        </Card>
      )}

      {showSelection && mediaKind === "image" && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                {selectedFiles.length} image{selectedFiles.length === 1 ? "" : "s"} selected
              </h3>
              <p className="text-xs text-gray-500 shrink-0">
                Up to {limits.image.maxBatchUpload} · max {Math.round(limits.image.maxSizeBytes / (1024 * 1024))} MB each
              </p>
            </div>
            <ul className="max-h-40 overflow-y-auto space-y-2 text-sm">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.size}`} className="flex justify-between gap-2 truncate">
                  <span className="truncate">{file.name}</span>
                  <span className="text-gray-500 shrink-0">{formatFileSize(file.size)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {showSelection && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSelectedFiles([]);
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
                {mediaKind === "image" && selectedFiles.length > 1
                  ? `Upload ${selectedFiles.length} images`
                  : "Upload Now"}
              </>
            )}
          </Button>
        </div>
      )}

      {currentVideoUpload && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              {currentVideoUpload.phase === "complete" ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
              ) : currentVideoUpload.phase === "error" ? (
                <AlertCircleIcon className="h-5 w-5 text-red-500" />
              ) : (
                <LoadingSpinner size="sm" />
              )}
              <div className="flex-1">
                <p className="font-medium text-sm">{getVideoPhaseMessage(currentVideoUpload.phase)}</p>
                <p className="text-xs text-gray-500 truncate">{currentVideoUpload.file.name}</p>
              </div>
            </div>

            {currentVideoUpload.phase === "error" && currentVideoUpload.error && (
              <p className="text-sm text-destructive">{currentVideoUpload.error.message}</p>
            )}

            {(currentVideoUpload.phase === "uploading" || currentVideoUpload.progress > 0) && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>{currentVideoUpload.progress}%</span>
                  {currentVideoUpload.bytesUploaded != null && currentVideoUpload.totalBytes != null && (
                    <span>
                      {formatFileSize(currentVideoUpload.bytesUploaded)} /{" "}
                      {formatFileSize(currentVideoUpload.totalBytes)}
                    </span>
                  )}
                </div>
                <Progress value={currentVideoUpload.progress} className="h-2" />
              </div>
            )}

            {currentVideoUpload.phase !== "uploading" &&
              currentVideoUpload.progress === 0 &&
              currentVideoUpload.phase !== "complete" &&
              currentVideoUpload.phase !== "error" && <Progress value={null} className="h-2" />}

            {currentVideoUpload.phase !== "complete" && currentVideoUpload.phase !== "error" && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleCancelVideoUpload}>
                  Cancel Upload
                </Button>
              </div>
            )}

            {currentVideoUpload.phase === "error" && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleDismissVideoError}>
                  Try again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(batchRunning || batchComplete) && batchUploads.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{batchRunning ? "Uploading images…" : "Upload summary"}</h3>
              {!batchRunning && batchComplete && (
                <p className="text-sm text-gray-500">
                  {completedCount}/{totalCount} succeeded
                  {failedCount > 0 ? ` · ${failedCount} failed` : ""}
                </p>
              )}
            </div>

            {batchRunning && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <LoadingSpinner size="sm" />
                Processing up to 2 images at a time…
              </div>
            )}

            <ul className="max-h-56 overflow-y-auto space-y-3">
              {batchUploads.map((upload) => (
                <li key={upload.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {upload.phase === "complete" ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
                    ) : upload.phase === "error" ? (
                      <AlertCircleIcon className="h-4 w-4 text-red-500 shrink-0" />
                    ) : (
                      <LoadingSpinner size="sm" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{upload.file.name}</p>
                      <p className="text-xs text-gray-500">{getImagePhaseMessage(upload.phase)}</p>
                    </div>
                    {upload.uploading && (
                      <Button variant="ghost" size="sm" onClick={() => cancelImageUpload(upload.id)}>
                        Cancel
                      </Button>
                    )}
                  </div>

                  {upload.phase === "error" && upload.error && (
                    <p className="text-xs text-destructive">{upload.error.message}</p>
                  )}

                  {upload.phase === "uploading" && <Progress value={upload.progress} className="h-1.5" />}

                  {(upload.phase === "requesting-url" || upload.phase === "confirming") && (
                    <Progress value={null} className="h-1.5" />
                  )}
                </li>
              ))}
            </ul>

            {!batchRunning && batchComplete && (
              <div className="flex justify-end">
                <Button onClick={handleBatchDone}>Done</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasDuplicateFilename && selectedVideo && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>
            A video named <strong>&ldquo;{selectedVideo.name}&rdquo;</strong> already exists. Rename the file or choose
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
