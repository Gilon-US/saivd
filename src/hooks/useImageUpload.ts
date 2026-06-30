import {useState} from "react";
import {v4 as uuidv4} from "uuid";
import {useToast} from "@/hooks/useToast";
import {
  buildExistingLibraryKeys,
  checkImageDuplicate,
  sha256Hex,
  type ExistingImageFingerprint,
  type SkippedImageUpload,
} from "@/lib/image-deduplication";

export type ImageUploadPhase =
  | "requesting-url"   // Getting presigned URL
  | "uploading"        // Uploading to Wasabi via XHR
  | "confirming"       // Saving record to DB
  | "complete"         // Done
  | "error";

export type ImageUploadState = {
  id: string;
  batchId?: string;
  phase: ImageUploadPhase;
  progress: number;
  uploading: boolean;
  error: Error | null;
  file: File;
  imageKey: string | null;
  abortController?: AbortController;
  uploadSpeed?: number;
  timeRemaining?: number;
  bytesUploaded?: number;
  totalBytes?: number;
};

export type ImageUploadResult = {
  id: string;
  key: string;
  filename: string;
  originalUrl: string;
  createdAt: string;
};

export type ImageBatchUploadResult = {
  batchId: string;
  succeeded: ImageUploadResult[];
  failed: {file: File; error: Error}[];
  skipped: SkippedImageUpload[];
};

export type ImageUploadOptions = {
  silentToasts?: boolean;
  batchId?: string;
};

export type ImageBatchUploadOptions = {
  concurrency?: number;
  maxBatch?: number;
  silentToasts?: boolean;
  batchId?: string;
  /** User's existing images — duplicates (filename + size) are skipped. */
  existingImages?: ExistingImageFingerprint[];
};

const DEFAULT_BATCH_CONCURRENCY = 2;
const DEFAULT_MAX_BATCH = 100;

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return error.message;
    const msg = error.message;
    if (error.name === "TypeError" || /fetch|network|failed to fetch/i.test(msg))
      return "Network error. Please check your connection and try again.";
    if (/upload failed with status 5\d{2}/i.test(msg))
      return "Server error. Please try again later.";
    return msg;
  }
  if (typeof error === "object" && error !== null && "message" in error)
    return String((error as {message: unknown}).message);
  return "An error occurred during upload.";
}

async function fetchExistingImageFingerprints(): Promise<ExistingImageFingerprint[]> {
  const res = await fetch("/api/images/dedup-index", {credentials: "include"});
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) return [];
  return (body.data?.images ?? []) as ExistingImageFingerprint[];
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

export function useImageUpload() {
  const [uploads, setUploads] = useState<Record<string, ImageUploadState>>({});
  const {toast} = useToast();

  const uploadImage = async (file: File, options?: ImageUploadOptions): Promise<ImageUploadResult> => {
    const uploadId = uuidv4();
    const abortController = new AbortController();
    const silentToasts = options?.silentToasts ?? false;
    const batchId = options?.batchId;

    setUploads((prev) => ({
      ...prev,
      [uploadId]: {
        id: uploadId,
        batchId,
        phase: "requesting-url",
        progress: 0,
        uploading: true,
        error: null,
        imageKey: null,
        file,
        abortController,
        totalBytes: file.size,
        bytesUploaded: 0,
      },
    }));

    try {
      // Step 1: Get presigned POST URL
      const urlRes = await fetch("/api/images/upload", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({filename: file.name, contentType: file.type, filesize: file.size}),
        credentials: "include",
        signal: abortController.signal,
      });

      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({}));
        throw new Error(errData.error?.message ?? `Failed to get upload URL: ${urlRes.status}`);
      }

      const {data: {uploadUrl, fields, key}} = await urlRes.json();

      // Step 2: Upload directly to Wasabi
      setUploads((prev) => ({...prev, [uploadId]: {...prev[uploadId], phase: "uploading", progress: 0}}));

      let lastUpdate = Date.now();
      let lastBytes = 0;

      await uploadToWasabi(uploadUrl, fields, file, (progress, bytesUploaded, totalBytes) => {
        const now = Date.now();
        const elapsed = (now - lastUpdate) / 1000;
        const speed = elapsed > 0 ? (bytesUploaded - lastBytes) / elapsed : 0;
        const remaining = speed > 0 ? (totalBytes - bytesUploaded) / speed : undefined;
        lastUpdate = now;
        lastBytes = bytesUploaded;

        setUploads((prev) => ({
          ...prev,
          [uploadId]: {...prev[uploadId], progress, bytesUploaded, totalBytes, uploadSpeed: speed, timeRemaining: remaining},
        }));
      }, abortController);

      // Step 3: Confirm upload — saves record to DB
      setUploads((prev) => ({...prev, [uploadId]: {...prev[uploadId], phase: "confirming", progress: 95}}));

      const confirmRes = await fetch("/api/images/confirm", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({key, filename: file.name, filesize: file.size, contentType: file.type}),
        credentials: "include",
        signal: abortController.signal,
      });

      if (!confirmRes.ok) {
        const errData = await confirmRes.json().catch(() => ({}));
        throw new Error(errData.error?.message ?? `Failed to confirm upload: ${confirmRes.status}`);
      }

      const {data} = await confirmRes.json();

      setUploads((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          uploading: false,
          phase: "complete",
          progress: 100,
          imageKey: key,
          bytesUploaded: file.size,
          timeRemaining: 0,
        },
      }));

      if (!silentToasts) {
        toast({title: "Image uploaded", description: `${file.name} has been uploaded successfully.`, variant: "success"});
      }

      return data as ImageUploadResult;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return Promise.reject(error);

      const msg = normalizeError(error);

      setUploads((prev) => ({
        ...prev,
        [uploadId]: {...prev[uploadId], uploading: false, phase: "error", error: new Error(msg)},
      }));

      if (!silentToasts) {
        toast({title: "Upload failed", description: msg, variant: "error"});
      }
      return Promise.reject(new Error(msg));
    }
  };

  const uploadImages = async (
    files: File[],
    options?: ImageBatchUploadOptions
  ): Promise<ImageBatchUploadResult> => {
    const maxBatch = options?.maxBatch ?? DEFAULT_MAX_BATCH;
    const concurrency = options?.concurrency ?? DEFAULT_BATCH_CONCURRENCY;
    const silentToasts = options?.silentToasts ?? false;

    if (files.length > maxBatch) {
      const msg = `Too many files. Maximum is ${maxBatch} images per batch.`;
      toast({title: "Too many files", description: msg, variant: "error"});
      throw new Error(msg);
    }

    const batchId = options?.batchId ?? uuidv4();
    const succeeded: ImageUploadResult[] = [];
    const failed: {file: File; error: Error}[] = [];
    const skipped: SkippedImageUpload[] = [];

    const libraryKeys = buildExistingLibraryKeys(
      options?.existingImages ?? (await fetchExistingImageFingerprints()),
    );
    const batchHashes = new Set<string>();
    const filesToUpload: File[] = [];

    for (const file of files) {
      const fileHash = await sha256Hex(file);
      const duplicate = checkImageDuplicate(file, {libraryKeys, batchHashes, fileHash});
      if (duplicate) {
        skipped.push(duplicate);
        continue;
      }
      batchHashes.add(fileHash);
      filesToUpload.push(file);
    }

    await mapWithConcurrency(filesToUpload, concurrency, async (file) => {
      try {
        const result = await uploadImage(file, {silentToasts: true, batchId});
        succeeded.push(result);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          failed.push({file, error});
          return;
        }
        failed.push({
          file,
          error: error instanceof Error ? error : new Error(normalizeError(error)),
        });
      }
    });

    if (!silentToasts) {
      if (failed.length === 0 && skipped.length === 0) {
        toast({
          title: "Upload complete",
          description: `${succeeded.length} image${succeeded.length === 1 ? "" : "s"} uploaded successfully.`,
          variant: "success",
        });
      } else if (succeeded.length === 0 && failed.length === 0 && skipped.length > 0) {
        toast({
          title: "No new images uploaded",
          description: `${skipped.length} duplicate image${skipped.length === 1 ? "" : "s"} skipped.`,
          variant: "info",
        });
      } else if (succeeded.length === 0 && failed.length > 0) {
        toast({
          title: "Upload failed",
          description: `All ${failed.length} image${failed.length === 1 ? "" : "s"} failed to upload.`,
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
    if (upload?.uploading && upload.abortController) {
      upload.abortController.abort();
      setUploads((prev) => ({
        ...prev,
        [uploadId]: {...prev[uploadId], uploading: false, phase: "error", error: new Error("Upload cancelled")},
      }));
      toast({title: "Upload cancelled", description: `${upload.file.name} upload was cancelled.`, variant: "info"});
    }
  };

  const clearUpload = (uploadId: string) => {
    setUploads((prev) => {
      const next = {...prev};
      delete next[uploadId];
      return next;
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

  return {uploadImage, uploadImages, cancelUpload, clearUpload, clearBatch, uploads};
}

async function uploadToWasabi(
  url: string,
  fields: Record<string, string>,
  file: File,
  onProgress: (progress: number, bytesUploaded: number, totalBytes: number) => void,
  abortController?: AbortController
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100), e.loaded, e.total);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    const formData = new FormData();
    Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
    formData.append("file", file);

    xhr.open("POST", url);
    xhr.send(formData);

    if (abortController) {
      abortController.signal.addEventListener("abort", () => xhr.abort());
    }
  });
}
