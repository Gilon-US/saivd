"use client";

import {useState, useEffect, useMemo} from "react";
import {v4 as uuidv4} from "uuid";
import FileUploader from "@/components/FileUploader";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Progress} from "@/components/ui/progress";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {
  useImageUpload,
  ImageUploadResult,
  ImageUploadPhase,
  ImageBatchUploadResult,
} from "@/hooks/useImageUpload";
import {UploadIcon, CheckCircleIcon, AlertCircleIcon} from "lucide-react";

type ImageUploaderProps = {
  onUploadComplete?: (result: ImageUploadResult) => void;
  onBatchComplete?: (result: ImageBatchUploadResult) => void;
  className?: string;
};

type ImageLimits = {
  maxSizeBytes: number;
  maxBatchUpload: number;
  allowedTypes: string[];
};

const DEFAULT_LIMITS: ImageLimits = {
  maxSizeBytes: 10 * 1024 * 1024,
  maxBatchUpload: 100,
  allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/tiff"],
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
    case "uploading":      return "Uploading…";
    case "confirming":     return "Finalizing…";
    case "complete":       return "Complete";
    case "error":          return "Failed";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export function ImageUploader({onUploadComplete, onBatchComplete, className = ""}: ImageUploaderProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<ImageLimits>(DEFAULT_LIMITS);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<ImageBatchUploadResult | null>(null);

  const {uploadImages, cancelUpload, clearBatch, uploads} = useImageUpload();

  useEffect(() => {
    fetch("/api/media/upload/limits")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.image) {
          const image = json.data.image as {
            maxSizeBytes: number;
            maxBatchUpload?: number;
            allowedTypes: string[];
          };
          setLimits({
            maxSizeBytes: image.maxSizeBytes,
            maxBatchUpload: image.maxBatchUpload ?? DEFAULT_LIMITS.maxBatchUpload,
            allowedTypes: image.allowedTypes,
          });
        }
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  const acceptMap = useMemo(() => {
    const accept: Record<string, string[]> = {...ACCEPTED_TYPES};
    for (const mime of limits.allowedTypes) {
      if (!accept[mime]) {
        const ext = mime.split("/")[1];
        accept[mime] = ext ? [`.${ext}`] : [];
      }
    }
    return accept;
  }, [limits.allowedTypes]);

  const batchUploads = useMemo(() => {
    if (!activeBatchId) return [];
    return Object.values(uploads)
      .filter((u) => u.batchId === activeBatchId)
      .sort((a, b) => a.file.name.localeCompare(b.file.name));
  }, [uploads, activeBatchId]);

  const batchComplete =
    batchResult !== null ||
    (batchUploads.length > 0 &&
      batchUploads.every((u) => u.phase === "complete" || u.phase === "error") &&
      !batchRunning);

  const handleFilesSelected = (files: File[]) => {
    if (batchRunning) return;

    const invalidType = files.find((f) => !limits.allowedTypes.includes(f.type));
    if (invalidType) {
      setError(`"${invalidType.name}" is not an allowed image type. Check Settings → General.`);
      setSelectedFiles([]);
      return;
    }

    const tooLarge = files.find((f) => f.size > limits.maxSizeBytes);
    if (tooLarge) {
      setError(
        `"${tooLarge.name}" is too large. Maximum size is ${Math.round(limits.maxSizeBytes / (1024 * 1024))} MB.`
      );
      setSelectedFiles([]);
      return;
    }

    if (files.length > limits.maxBatchUpload) {
      setError(`Too many files. Maximum is ${limits.maxBatchUpload} images per batch.`);
      setSelectedFiles(files.slice(0, limits.maxBatchUpload));
      return;
    }

    setSelectedFiles(files);
    setError(null);
    setBatchResult(null);
    setActiveBatchId(null);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || batchRunning) return;
    setError(null);
    setBatchResult(null);
    setBatchRunning(true);
    const batchId = uuidv4();
    setActiveBatchId(batchId);

    try {
      const result = await uploadImages(selectedFiles, {
        maxBatch: limits.maxBatchUpload,
        concurrency: 2,
        batchId,
      });
      setBatchResult(result);
      setSelectedFiles([]);

      if (result.succeeded.length === 1 && result.failed.length === 0) {
        onUploadComplete?.(result.succeeded[0]);
      }
      onBatchComplete?.(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message ?? "Upload failed");
      }
    } finally {
      setBatchRunning(false);
    }
  };

  const handleDone = () => {
    if (activeBatchId) clearBatch(activeBatchId);
    setActiveBatchId(null);
    setBatchResult(null);
    setSelectedFiles([]);
    setError(null);
  };

  const completedCount = batchResult?.succeeded.length ?? batchUploads.filter((u) => u.phase === "complete").length;
  const failedCount = batchResult?.failed.length ?? batchUploads.filter((u) => u.phase === "error").length;
  const totalCount = batchResult
    ? batchResult.succeeded.length + batchResult.failed.length
    : batchUploads.length;

  return (
    <div className={`space-y-6 ${className}`}>
      {!batchComplete && (
        <FileUploader
          accept={acceptMap}
          maxSize={limits.maxSizeBytes}
          maxFiles={limits.maxBatchUpload}
          invalidTypeMessage="Invalid file type. Please upload a supported image file."
          onFilesSelected={handleFilesSelected}
        />
      )}

      {selectedFiles.length > 0 && !batchRunning && !batchComplete && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                {selectedFiles.length} image{selectedFiles.length === 1 ? "" : "s"} selected
              </h3>
              <p className="text-xs text-gray-500">
                Up to {limits.maxBatchUpload} per batch · max {Math.round(limits.maxSizeBytes / (1024 * 1024))} MB each
              </p>
            </div>
            <ul className="max-h-48 overflow-y-auto space-y-2 text-sm">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.size}`} className="flex justify-between gap-2 truncate">
                  <span className="truncate">{file.name}</span>
                  <span className="text-gray-500 shrink-0">{formatFileSize(file.size)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedFiles([])}>
                Clear
              </Button>
              <Button onClick={handleUpload}>
                <UploadIcon className="mr-2 h-4 w-4" />
                Upload {selectedFiles.length} image{selectedFiles.length === 1 ? "" : "s"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(batchRunning || batchComplete) && batchUploads.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">
                {batchRunning ? "Uploading images…" : "Upload summary"}
              </h3>
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

            <ul className="max-h-72 overflow-y-auto space-y-3">
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
                      <p className="text-xs text-gray-500">{getPhaseMessage(upload.phase)}</p>
                    </div>
                    {upload.uploading && (
                      <Button variant="ghost" size="sm" onClick={() => cancelUpload(upload.id)}>
                        Cancel
                      </Button>
                    )}
                  </div>

                  {upload.phase === "error" && upload.error && (
                    <p className="text-xs text-destructive">{upload.error.message}</p>
                  )}

                  {upload.phase === "uploading" && (
                    <Progress value={upload.progress} className="h-1.5" />
                  )}

                  {(upload.phase === "requesting-url" || upload.phase === "confirming") && (
                    <Progress value={null} className="h-1.5" />
                  )}
                </li>
              ))}
            </ul>

            {!batchRunning && batchComplete && (
              <div className="flex justify-end">
                <Button onClick={handleDone}>Done</Button>
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
