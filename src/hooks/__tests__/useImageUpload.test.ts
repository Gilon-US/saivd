import {renderHook, act} from "@testing-library/react";
import {useImageUpload, type ImageBatchUploadResult} from "../useImageUpload";
import {useToast} from "../useToast";

jest.mock("uuid", () => ({
  v4: jest.fn(() => "test-upload-id"),
}));

jest.mock("../useToast", () => ({
  useToast: jest.fn(),
}));

global.fetch = jest.fn();

const xhrMock = {
  open: jest.fn(),
  send: jest.fn(),
  setRequestHeader: jest.fn(),
  upload: {addEventListener: jest.fn()},
  addEventListener: jest.fn(),
};

// @ts-expect-error - mock XMLHttpRequest
window.XMLHttpRequest = jest.fn(() => xhrMock);

describe("useImageUpload", () => {
  const mockToast = {toast: jest.fn()};

  beforeEach(() => {
    jest.clearAllMocks();
    (useToast as jest.Mock).mockReturnValue(mockToast);

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/images/upload") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                uploadUrl: "https://test-bucket.wasabisys.com",
                fields: {key: "test-key"},
                key: "uploads/user-id/test-key",
              },
            }),
        });
      }
      if (url === "/api/images/confirm") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                id: "img-1",
                key: "uploads/user-id/test-key",
                filename: "photo.jpg",
                originalUrl: "https://test-bucket.wasabisys.com/uploads/user-id/test-key",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            }),
        });
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`));
    });

    xhrMock.addEventListener.mockImplementation((event: string, callback: () => void) => {
      if (event === "load") {
        setTimeout(() => {
          Object.defineProperty(xhrMock, "status", {value: 200});
          callback();
        }, 10);
      }
    });

    xhrMock.upload.addEventListener.mockImplementation((event: string, callback: (e: ProgressEvent) => void) => {
      if (event === "progress") {
        setTimeout(() => {
          callback({lengthComputable: true, loaded: 100, total: 100} as ProgressEvent);
        }, 5);
      }
    });
  });

  it("uploadImages rejects batches over maxBatch", async () => {
    const {result} = renderHook(() => useImageUpload());
    const files = Array.from({length: 3}, (_, i) =>
      new File(["x"], `photo-${i}.jpg`, {type: "image/jpeg"})
    );

    await expect(
      act(async () => {
        await result.current.uploadImages(files, {maxBatch: 2});
      })
    ).rejects.toThrow("Too many files");

    expect(mockToast.toast).toHaveBeenCalledWith(
      expect.objectContaining({title: "Too many files"})
    );
  });

  it("uploadImages uploads multiple files with a summary toast", async () => {
    const {result} = renderHook(() => useImageUpload());
    const files = [
      new File(["a"], "a.jpg", {type: "image/jpeg"}),
      new File(["b"], "b.jpg", {type: "image/jpeg"}),
    ];

    let batchResult: ImageBatchUploadResult | undefined;
    await act(async () => {
      batchResult = await result.current.uploadImages(files, {maxBatch: 100, batchId: "batch-1"});
    });

    expect(batchResult?.succeeded).toHaveLength(2);
    expect(batchResult?.failed).toHaveLength(0);
    expect(batchResult?.batchId).toBe("batch-1");
    expect(mockToast.toast).toHaveBeenCalledWith(
      expect.objectContaining({title: "Upload complete", variant: "success"})
    );
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it("uploadImages records partial failures", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/images/upload") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                uploadUrl: "https://test-bucket.wasabisys.com",
                fields: {key: "test-key"},
                key: "uploads/user-id/test-key",
              },
            }),
        });
      }
      if (url === "/api/images/confirm") {
        return Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              success: false,
              error: {code: "server_error", message: "Confirm failed"},
            }),
        });
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`));
    });

    const {result} = renderHook(() => useImageUpload());
    const files = [new File(["a"], "a.jpg", {type: "image/jpeg"})];

    let batchResult: ImageBatchUploadResult | undefined;
    await act(async () => {
      batchResult = await result.current.uploadImages(files, {maxBatch: 100});
    });

    expect(batchResult?.succeeded).toHaveLength(0);
    expect(batchResult?.failed).toHaveLength(1);
    expect(mockToast.toast).toHaveBeenCalledWith(
      expect.objectContaining({title: "Upload failed", variant: "error"})
    );
  });
});
