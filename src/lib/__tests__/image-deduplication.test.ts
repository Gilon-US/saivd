import {
  buildExistingLibraryKeys,
  checkImageDuplicate,
  libraryImageKey,
} from "@/lib/image-deduplication";

describe("image-deduplication", () => {
  it("builds library keys from filename and size", () => {
    const keys = buildExistingLibraryKeys([{filename: "Photo.JPG", file_size: 1024}]);
    expect(keys.has(libraryImageKey("photo.jpg", 1024))).toBe(true);
  });

  it("skips files already in the library", () => {
    const file = new File(["x"], "photo.jpg", {type: "image/jpeg"});
    Object.defineProperty(file, "size", {value: 1024});

    const libraryKeys = buildExistingLibraryKeys([{filename: "photo.jpg", file_size: 1024}]);
    const result = checkImageDuplicate(file, {
      libraryKeys,
      batchHashes: new Set(),
      fileHash: "abc123",
    });

    expect(result?.reason).toBe("library");
    expect(result?.message).toBe("Already in your library");
  });

  it("skips duplicate content within the same batch", () => {
    const file = new File(["x"], "copy.jpg", {type: "image/jpeg"});
    const result = checkImageDuplicate(file, {
      libraryKeys: new Set(),
      batchHashes: new Set(["same-hash"]),
      fileHash: "same-hash",
    });

    expect(result?.reason).toBe("batch");
    expect(result?.message).toBe("Duplicate in this batch");
  });

  it("allows unique files", () => {
    const file = new File(["x"], "new.jpg", {type: "image/jpeg"});
    Object.defineProperty(file, "size", {value: 2048});

    const result = checkImageDuplicate(file, {
      libraryKeys: new Set(),
      batchHashes: new Set(),
      fileHash: "unique-hash",
    });

    expect(result).toBeNull();
  });
});
