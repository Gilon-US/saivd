export type ExistingImageFingerprint = {
  filename: string;
  file_size: number | null;
};

export type ImageSkipReason = "library" | "batch";

export type SkippedImageUpload = {
  file: File;
  reason: ImageSkipReason;
  message: string;
};

/** Stable key for filename + size matches against the user's library. */
export function libraryImageKey(filename: string, fileSize: number): string {
  return `${filename.trim().toLowerCase()}\0${fileSize}`;
}

export function buildExistingLibraryKeys(existing: ExistingImageFingerprint[]): Set<string> {
  const keys = new Set<string>();
  for (const image of existing) {
    if (image.file_size == null) continue;
    keys.add(libraryImageKey(image.filename, image.file_size));
  }
  return keys;
}

async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }
  if (typeof file.text === "function") {
    return new TextEncoder().encode(await file.text()).buffer;
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read file bytes for duplicate detection"));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read file bytes for duplicate detection"));
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await fileToArrayBuffer(file);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function checkImageDuplicate(
  file: File,
  options: {
    libraryKeys: Set<string>;
    batchHashes: Set<string>;
    fileHash: string;
  },
): SkippedImageUpload | null {
  const libraryKey = libraryImageKey(file.name, file.size);
  if (options.libraryKeys.has(libraryKey)) {
    return {
      file,
      reason: "library",
      message: "Already in your library",
    };
  }

  if (options.batchHashes.has(options.fileHash)) {
    return {
      file,
      reason: "batch",
      message: "Duplicate in this batch",
    };
  }

  return null;
}
