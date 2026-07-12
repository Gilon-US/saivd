import {useState} from "react";
import {v4 as uuidv4} from "uuid";
import {useToast} from "@/hooks/useToast";
import {generateVideoThumbnail} from "@/utils/videoThumbnail";
import {probeDisplayAspectFromFile} from "@/lib/video-display-aspect";

/**
 * Upload phase tracking
 */
export type UploadPhase =
  | "preparing" // Thumbnail generation
  | "requesting-url" // Getting pre-signed URL
  | "uploading" // Actual file upload to Wasabi
  | "confirming" // Confirming upload completion
  | "complete" // Upload finished
  | "error"; // Upload failed

/**
 * Upload state for a single video upload
 */
export type UploadState = {
  id: string;
  batchId?: string;
  progress: number;
  uploading: boolean;
  phase: UploadPhase;
  error: Error | null;
  videoKey: string | null;
  file: File;
  abortController?: AbortController;
  uploadSpeed?: number; // bytes per second
  timeRemaining?: number; // seconds
  bytesUploaded?: number;
  totalBytes?: number;
};

/**
 * Result of a successful upload
 */
export type UploadResult = {
  id?: string;
  key: string;
  filename: string;
  originalUrl: string;
  thumbnailUrl: string;
};

export type SkippedVideoUpload = {
  file: File;
  reason: "library_duplicate" | "batch_duplicate";
  message: string;
};

export type VideoBatchUploadResult = {
  batchId: string;
  succeeded: UploadResult[];
  failed: {file: File; error: Error}[];
  skipped: SkippedVideoUpload[];
};

export type VideoUploadOptions = {
  silentToasts?: boolean;
  batchId?: string;
};

export type VideoBatchUploadOptions = {
  concurrency?: number;
  maxBatch?: number;
  silentToasts?: boolean;
  batchId?: string;
  /** Existing library videos — same filename (case-insensitive) is skipped. */
  existingVideos?: {filename: string}[];
};

const DEFAULT_BATCH_CONCURRENCY = 1;
const DEFAULT_MAX_BATCH = 5;

/**
 * Normalize upload failures to user-friendly messages for toast and UI.
 */
function normalizeUploadError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return error.message;
    }
    const msg = error.message;
    if (error.name === "TypeError" || /fetch|network|failed to fetch/i.test(msg)) {
      return "Network error. Please check your connection and try again.";
    }
    if (/upload failed with status 5\d{2}/i.test(msg)) {
      return "Server error. Please try again later.";
    }
    if (msg === "Network error during upload") {
      return "Network error. Please check your connection and try again.";
    }
    return msg;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as {message: unknown}).message);
  }
  return "An error occurred during upload.";
}

function videoIdentityKey(name: string, size: number): string {
  return `${name.trim().toLowerCase()}::${size}`;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await fn(items[index]);
    }
  }

  await Promise.all(Array.from({length: workerCount}, () => worker()));
}

/**
 * Hook for managing video uploads with progress tracking
 */
export function useVideoUpload() {
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const {toast} = useToast();

  /**
   * Upload a video file to Wasabi storage
   */
  const uploadVideo = async (file: File, options?: VideoUploadOptions): Promise<UploadResult> => {
    const uploadId = uuidv4();
    const abortController = new AbortController();
    const silentToasts = options?.silentToasts ?? false;
    const batchId = options?.batchId;

    setUploads((prev) => ({
      ...prev,
      [uploadId]: {
        id: uploadId,
        batchId,
        progress: 0,
        uploading: true,
        phase: "preparing",
        error: null,
        videoKey: null,
        file,
        abortController,
        totalBytes: file.size,
        bytesUploaded: 0,
      },
    }));

    try {
      let previewThumbnail: string | null = null;
      let sourceDisplayAspect: number | null = null;
      try {
        setUploads((prev) => {
          if (!prev[uploadId]) return prev;
          return {
            ...prev,
            [uploadId]: {
              ...prev[uploadId],
              phase: "preparing",
            },
          };
        });

        const [thumbnail, displayAspect] = await Promise.all([
          generateVideoThumbnail(file).catch((err) => {
            console.warn("Failed to generate thumbnail:", err);
            return null;
          }),
          probeDisplayAspectFromFile(file).catch((err) => {
            console.warn("Failed to probe display aspect:", err);
            return null;
          }),
        ]);
        previewThumbnail = thumbnail;
        sourceDisplayAspect = displayAspect;
        console.log("Prepared upload metadata for", file.name, {sourceDisplayAspect});
      } catch (thumbnailError) {
        console.warn("Failed to prepare upload metadata:", thumbnailError);
      }

      setUploads((prev) => {
        if (!prev[uploadId]) return prev;
        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            phase: "requesting-url",
          },
        };
      });

      const getUrlResponse = await fetch("/api/videos/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          filesize: file.size,
        }),
        credentials: "include",
        signal: abortController.signal,
      });

      if (!getUrlResponse.ok) {
        try {
          const errorData = await getUrlResponse.json();
          console.error("Pre-signed URL error response:", errorData);
          throw new Error(
            errorData.error?.message ||
              `Failed to get upload URL: ${getUrlResponse.status} ${getUrlResponse.statusText}`
          );
        } catch (parseError) {
          if (parseError instanceof Error && parseError.message.startsWith("Failed to get")) {
            throw parseError;
          }
          console.error("Error parsing error response:", parseError);
          throw new Error(
            `Failed to get upload URL: ${getUrlResponse.status} ${getUrlResponse.statusText}`
          );
        }
      }

      const {
        data: {uploadUrl, fields, key},
      } = await getUrlResponse.json();

      setUploads((prev) => {
        if (!prev[uploadId]) return prev;
        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            phase: "uploading",
            progress: 0,
          },
        };
      });

      let lastProgressUpdate = Date.now();
      let lastBytesUploaded = 0;

      await uploadToWasabi(
        uploadUrl,
        fields,
        file,
        (progress, bytesUploaded, totalBytes) => {
          const now = Date.now();
          const timeElapsed = (now - lastProgressUpdate) / 1000;
          const bytesDelta = bytesUploaded - lastBytesUploaded;
          const uploadSpeed = timeElapsed > 0 ? bytesDelta / timeElapsed : 0;
          const bytesRemaining = totalBytes - bytesUploaded;
          const timeRemaining = uploadSpeed > 0 ? bytesRemaining / uploadSpeed : undefined;

          setUploads((prev) => {
            if (!prev[uploadId]) return prev;

            lastProgressUpdate = now;
            lastBytesUploaded = bytesUploaded;

            return {
              ...prev,
              [uploadId]: {
                ...prev[uploadId],
                progress,
                bytesUploaded,
                totalBytes,
                uploadSpeed,
                timeRemaining,
              },
            };
          });
        },
        abortController
      );

      setUploads((prev) => {
        if (!prev[uploadId]) return prev;
        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            phase: "confirming",
            progress: 95,
          },
        };
      });

      const confirmResponse = await fetch("/api/videos/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          filename: file.name,
          filesize: file.size,
          contentType: file.type,
          previewThumbnailData: previewThumbnail,
          sourceDisplayAspect,
        }),
        credentials: "include",
        signal: abortController.signal,
      });

      if (!confirmResponse.ok) {
        try {
          const errorData = await confirmResponse.json();
          console.error("Confirm upload error response:", errorData);
          throw new Error(
            errorData.error?.message ||
              `Failed to confirm upload: ${confirmResponse.status} ${confirmResponse.statusText}`
          );
        } catch (parseError) {
          if (parseError instanceof Error && parseError.message.startsWith("Failed to confirm")) {
            throw parseError;
          }
          console.error("Error parsing confirm response:", parseError);
          throw new Error(
            `Failed to confirm upload: ${confirmResponse.status} ${confirmResponse.statusText}`
          );
        }
      }

      const {data} = await confirmResponse.json();

      setUploads((prev) => {
        if (!prev[uploadId]) return prev;

        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            uploading: false,
            phase: "complete",
            progress: 100,
            videoKey: data.key,
            bytesUploaded: file.size,
            timeRemaining: 0,
          },
        };
      });

      if (!silentToasts) {
        toast({
          title: "Upload complete",
          description: `${file.name} has been uploaded successfully.`,
          variant: "success",
        });
      }

      try {
        const normalizeRes = await fetch(`/api/videos/${data.id}/normalize`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          credentials: "include",
        });
        if (!normalizeRes.ok) {
          const errData = await normalizeRes.json().catch(() => ({}));
          console.warn("[useVideoUpload] Normalize request failed", {
            status: normalizeRes.status,
            error: errData?.error,
          });
          if (!silentToasts) {
            toast({
              title: "Upload saved",
              description:
                "Preparation for streaming could not be started. You can try again from the video.",
              variant: "default",
            });
          }
        }
      } catch (normalizeErr) {
        if (normalizeErr instanceof Error && normalizeErr.name === "AbortError") {
          // Upload was cancelled
        } else {
          console.warn("[useVideoUpload] Normalize request error", normalizeErr);
          if (!silentToasts) {
            toast({
              title: "Upload saved",
              description:
                "Preparation for streaming could not be started. You can try again from the video.",
              variant: "default",
            });
          }
        }
      }

      return data;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        return Promise.reject(error);
      }

      const friendlyMessage = normalizeUploadError(error);

      setUploads((prev) => {
        if (!prev[uploadId]) return prev;

        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            uploading: false,
            phase: "error",
            error: new Error(friendlyMessage),
          },
        };
      });

      if (!silentToasts) {
        toast({
          title: "Upload failed",
          description: friendlyMessage,
          variant: "error",
        });
      }

      return Promise.reject(new Error(friendlyMessage));
    }
  };

  /**
   * Upload multiple videos sequentially (concurrency 1 by default).
   * Skips library filename duplicates and within-batch name+size duplicates.
   */
  const uploadVideos = async (
    files: File[],
    options?: VideoBatchUploadOptions
  ): Promise<VideoBatchUploadResult> => {
    const maxBatch = options?.maxBatch ?? DEFAULT_MAX_BATCH;
    const concurrency = options?.concurrency ?? DEFAULT_BATCH_CONCURRENCY;
    const silentToasts = options?.silentToasts ?? false;

    if (files.length > maxBatch) {
      const msg = `Too many files. Maximum is ${maxBatch} videos per batch.`;
      toast({title: "Too many files", description: msg, variant: "error"});
      throw new Error(msg);
    }

    const batchId = options?.batchId ?? uuidv4();
    const succeeded: UploadResult[] = [];
    const failed: {file: File; error: Error}[] = [];
    const skipped: SkippedVideoUpload[] = [];

    const libraryNames = new Set(
      (options?.existingVideos ?? []).map((v) => v.filename.trim().toLowerCase())
    );
    const batchKeys = new Set<string>();
    const filesToUpload: File[] = [];

    for (const file of files) {
      const nameKey = file.name.trim().toLowerCase();
      if (libraryNames.has(nameKey)) {
        skipped.push({
          file,
          reason: "library_duplicate",
          message: `A video named "${file.name}" already exists in your library.`,
        });
        continue;
      }

      const identity = videoIdentityKey(file.name, file.size);
      if (batchKeys.has(identity)) {
        skipped.push({
          file,
          reason: "batch_duplicate",
          message: `Duplicate of "${file.name}" in this batch.`,
        });
        continue;
      }

      batchKeys.add(identity);
      filesToUpload.push(file);
    }

    await mapWithConcurrency(filesToUpload, concurrency, async (file) => {
      try {
        const result = await uploadVideo(file, {silentToasts: true, batchId});
        succeeded.push(result);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          failed.push({file, error});
          return;
        }
        failed.push({
          file,
          error: error instanceof Error ? error : new Error(normalizeUploadError(error)),
        });
      }
    });

    if (!silentToasts) {
      if (failed.length === 0 && skipped.length === 0) {
        toast({
          title: "Upload complete",
          description: `${succeeded.length} video${succeeded.length === 1 ? "" : "s"} uploaded successfully.`,
          variant: "success",
        });
      } else if (succeeded.length === 0 && failed.length === 0 && skipped.length > 0) {
        toast({
          title: "No new videos uploaded",
          description: `${skipped.length} duplicate video${skipped.length === 1 ? "" : "s"} skipped.`,
          variant: "info",
        });
      } else if (succeeded.length === 0 && failed.length > 0) {
        toast({
          title: "Upload failed",
          description: `All ${failed.length} video${failed.length === 1 ? "" : "s"} failed to upload.`,
          variant: "error",
        });
      } else {
        const parts = [`${succeeded.length} uploaded`];
        if (skipped.length > 0) parts.push(`${skipped.length} skipped as duplicates`);
        if (failed.length > 0) parts.push(`${failed.length} failed`);
        toast({
          title: "Upload finished",
          description: parts.join(", ") + ".",
          variant: "info",
        });
      }
    }

    return {batchId, succeeded, failed, skipped};
  };

  const cancelUpload = (uploadId: string) => {
    const upload = uploads[uploadId];

    if (upload && upload.uploading && upload.abortController) {
      upload.abortController.abort();

      setUploads((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          uploading: false,
          phase: "error",
          error: new Error("Upload cancelled"),
        },
      }));

      toast({
        title: "Upload cancelled",
        description: `${upload.file.name} upload was cancelled.`,
        variant: "info",
      });
    }
  };

  const getUploadState = (uploadId: string): UploadState | undefined => {
    return uploads[uploadId];
  };

  const clearUpload = (uploadId: string) => {
    setUploads((prev) => {
      const newState = {...prev};
      delete newState[uploadId];
      return newState;
    });
  };

  const clearBatch = (batchId: string) => {
    setUploads((prev) => {
      const next = {...prev};
      for (const [id, upload] of Object.entries(next)) {
        if (upload.batchId === batchId) delete next[id];
      }
      return next;
    });
  };

  const uploadToWasabi = async (
    url: string,
    fields: Record<string, string>,
    file: File,
    onProgress: (progress: number, bytesUploaded: number, totalBytes: number) => void,
    abortController?: AbortController
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress, event.loaded, event.total);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error during upload"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload aborted"));
      });

      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append("file", file);

      xhr.open("POST", url);
      xhr.send(formData);

      if (abortController) {
        abortController.signal.addEventListener("abort", () => {
          xhr.abort();
        });
      }
    });
  };

  return {
    uploadVideo,
    uploadVideos,
    cancelUpload,
    getUploadState,
    clearUpload,
    clearBatch,
    uploads,
  };
}
