/**
 * useVideoUpload Hook Tests
 * 
 * This file contains tests for the useVideoUpload hook.
 * Run these tests with: npm test useVideoUpload
 * 
 * Note: These tests require Jest and React Testing Library to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { useVideoUpload } from '../useVideoUpload';
import { useToast } from '../useToast';

// Mock dependencies
jest.mock('../useToast', () => ({
  useToast: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

// Mock XMLHttpRequest
const xhrMock = {
  open: jest.fn(),
  send: jest.fn(),
  setRequestHeader: jest.fn(),
  upload: {
    addEventListener: jest.fn(),
  },
  addEventListener: jest.fn(),
};

// @ts-ignore
window.XMLHttpRequest = jest.fn(() => xhrMock);

// Mock URL methods
URL.createObjectURL = jest.fn();
URL.revokeObjectURL = jest.fn();

describe('useVideoUpload Hook', () => {
  const mockToast = { toast: jest.fn() };
  const mockFile = new File(['test'], 'test-video.mp4', { type: 'video/mp4' });
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock useToast
    (useToast as jest.Mock).mockReturnValue(mockToast);
    
    // Mock successful fetch responses
    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url === '/api/videos/upload') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              uploadUrl: 'https://test-bucket.wasabisys.com',
              fields: { key: 'test-key' },
              key: 'uploads/user-id/test-key',
            },
          }),
        });
      } else if (url === '/api/videos/confirm') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              key: 'uploads/user-id/test-key',
              filename: 'test-video.mp4',
              originalUrl: 'https://test-bucket.wasabisys.com/uploads/user-id/test-key',
              thumbnailUrl: '/placeholder-thumbnail.jpg',
            },
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    
    // Mock XMLHttpRequest events
    xhrMock.addEventListener.mockImplementation((event, callback) => {
      if (event === 'load') {
        // Simulate successful upload
        setTimeout(() => {
          Object.defineProperty(xhrMock, 'status', { value: 200 });
          callback();
        }, 10);
      }
    });
    
    // Mock upload progress events
    xhrMock.upload.addEventListener.mockImplementation((event, callback) => {
      if (event === 'progress') {
        // Simulate progress events
        setTimeout(() => {
          callback({ lengthComputable: true, loaded: 50, total: 100 });
        }, 5);
        setTimeout(() => {
          callback({ lengthComputable: true, loaded: 100, total: 100 });
        }, 10);
      }
    });
  });
  
  it('should initialize with empty uploads state', () => {
    const { result } = renderHook(() => useVideoUpload());
    
    expect(result.current.uploads).toEqual({});
  });
  
  it('should upload a video successfully', async () => {
    const { result } = renderHook(() => useVideoUpload());
    
    let uploadResult;
    await act(async () => {
      uploadResult = await result.current.uploadVideo(mockFile);
    });
    
    // Check that the API calls were made
    expect(global.fetch).toHaveBeenCalledWith('/api/videos/upload', expect.anything());
    expect(global.fetch).toHaveBeenCalledWith('/api/videos/confirm', expect.anything());
    
    // Check that XHR was used for the upload
    expect(xhrMock.open).toHaveBeenCalledWith('POST', 'https://test-bucket.wasabisys.com');
    expect(xhrMock.send).toHaveBeenCalled();
    
    // Check that the upload state was updated
    const uploadId = Object.keys(result.current.uploads)[0];
    expect(result.current.uploads[uploadId]).toBeDefined();
    expect(result.current.uploads[uploadId].progress).toBe(100);
    expect(result.current.uploads[uploadId].uploading).toBe(false);
    
    // Check that a success toast was shown
    expect(mockToast.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Upload complete',
      variant: 'success',
    }));
    
    // Check the returned result
    expect(uploadResult).toEqual({
      key: 'uploads/user-id/test-key',
      filename: 'test-video.mp4',
      originalUrl: 'https://test-bucket.wasabisys.com/uploads/user-id/test-key',
      thumbnailUrl: '/placeholder-thumbnail.jpg',
    });
  });
  
  it('should handle upload errors', async () => {
    // Mock a failed upload URL request
    (global.fetch as jest.Mock).mockImplementationOnce(() => 
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({
          success: false,
          error: { message: 'Failed to get upload URL' },
        }),
      })
    );
    
    const { result } = renderHook(() => useVideoUpload());
    
    let error;
    await act(async () => {
      try {
        await result.current.uploadVideo(mockFile);
      } catch (err) {
        error = err;
      }
    });
    
    // Check that the error was caught
    expect(error).toBeDefined();
    
    // Check that an error toast was shown
    expect(mockToast.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Upload failed',
      variant: 'error',
    }));
  });
  
  it('should cancel an upload', async () => {
    const { result } = renderHook(() => useVideoUpload());
    
    // Start an upload
    let uploadPromise;
    await act(async () => {
      uploadPromise = result.current.uploadVideo(mockFile);
    });
    
    // Get the upload ID
    const uploadId = Object.keys(result.current.uploads)[0];
    expect(uploadId).toBeDefined();
    
    // Mock abort controller
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
    
    // Cancel the upload
    await act(async () => {
      result.current.cancelUpload(uploadId);
    });
    
    // Check that abort was called
    expect(abortSpy).toHaveBeenCalled();
    
    // Check that the upload state was updated
    expect(result.current.uploads[uploadId].uploading).toBe(false);
    expect(result.current.uploads[uploadId].error).toBeDefined();
    
    // Check that a toast was shown
    expect(mockToast.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Upload cancelled',
      variant: 'info',
    }));
  });
  
  it('should clear an upload from state', async () => {
    const { result } = renderHook(() => useVideoUpload());
    
    // Start an upload
    await act(async () => {
      result.current.uploadVideo(mockFile);
    });
    
    // Get the upload ID
    const uploadId = Object.keys(result.current.uploads)[0];
    expect(uploadId).toBeDefined();
    
    // Clear the upload
    await act(async () => {
      result.current.clearUpload(uploadId);
    });
    
    // Check that the upload was removed from state
    expect(result.current.uploads[uploadId]).toBeUndefined();
  });
});
