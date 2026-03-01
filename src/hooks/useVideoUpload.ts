import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/hooks/useToast';
import { generateVideoThumbnail } from '@/utils/videoThumbnail';

/**
 * Upload phase tracking
 */
export type UploadPhase = 
  | 'preparing'      // Thumbnail generation
  | 'requesting-url' // Getting pre-signed URL
  | 'uploading'      // Actual file upload to Wasabi
  | 'confirming'     // Confirming upload completion
  | 'complete'       // Upload finished
  | 'error';         // Upload failed

/**
 * Upload state for a single video upload
 */
export type UploadState = {
  id: string;
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
  key: string;
  filename: string;
  originalUrl: string;
  thumbnailUrl: string;
};

/**
 * Normalize upload failures to user-friendly messages for toast and UI.
 */
function normalizeUploadError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return error.message;
    }
    const msg = error.message;
    if (error.name === 'TypeError' || /fetch|network|failed to fetch/i.test(msg)) {
      return 'Network error. Please check your connection and try again.';
    }
    if (/upload failed with status 5\d{2}/i.test(msg)) {
      return 'Server error. Please try again later.';
    }
    if (msg === 'Network error during upload') {
      return 'Network error. Please check your connection and try again.';
    }
    return msg;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An error occurred during upload.';
}

/**
 * Hook for managing video uploads with progress tracking
 */
export function useVideoUpload() {
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const { toast } = useToast();
  
  /**
   * Upload a video file to Wasabi storage
   * 
   * @param file The video file to upload
   * @returns Promise that resolves with the upload result
   */
  const uploadVideo = async (file: File): Promise<UploadResult> => {
    const uploadId = uuidv4();
    const abortController = new AbortController();
    const _startTime = Date.now();
    
    // Initialize upload state - show activity immediately
    setUploads((prev) => ({
      ...prev,
      [uploadId]: {
        id: uploadId,
        progress: 0,
        uploading: true,
        phase: 'preparing',
        error: null,
        videoKey: null,
        file,
        abortController,
        totalBytes: file.size,
        bytesUploaded: 0,
      },
    }));
    
    try {
      // Step 1: Generate thumbnail from video file
      let previewThumbnail: string | null = null;
      try {
        setUploads((prev) => {
          if (!prev[uploadId]) return prev;
          return {
            ...prev,
            [uploadId]: {
              ...prev[uploadId],
              phase: 'preparing',
            },
          };
        });
        
        previewThumbnail = await generateVideoThumbnail(file);
        console.log('Generated thumbnail for', file.name);
      } catch (thumbnailError) {
        console.warn('Failed to generate thumbnail:', thumbnailError);
        // Continue with upload even if thumbnail generation fails
      }

      // Step 2: Get pre-signed URL
      setUploads((prev) => {
        if (!prev[uploadId]) return prev;
        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            phase: 'requesting-url',
          },
        };
      });
      
      const getUrlResponse = await fetch('/api/videos/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          filesize: file.size,
        }),
        credentials: 'include', // Include cookies with the request
        signal: abortController.signal,
      });
      
      if (!getUrlResponse.ok) {
        try {
          const errorData = await getUrlResponse.json();
          console.error('Pre-signed URL error response:', errorData);
          throw new Error(errorData.error?.message || `Failed to get upload URL: ${getUrlResponse.status} ${getUrlResponse.statusText}`);
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
          throw new Error(`Failed to get upload URL: ${getUrlResponse.status} ${getUrlResponse.statusText}`);
        }
      }
      
      const { data: { uploadUrl, fields, key } } = await getUrlResponse.json();
      
      // Step 3: Upload file directly to Wasabi
      setUploads((prev) => {
        if (!prev[uploadId]) return prev;
        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            phase: 'uploading',
            progress: 0,
          },
        };
      });
      
      let lastProgressUpdate = Date.now();
      let lastBytesUploaded = 0;
      
      await uploadToWasabi(uploadUrl, fields, file, (progress, bytesUploaded, totalBytes) => {
        const now = Date.now();
        const timeElapsed = (now - lastProgressUpdate) / 1000; // seconds
        const bytesDelta = bytesUploaded - lastBytesUploaded;
        
        // Calculate upload speed (bytes per second)
        const uploadSpeed = timeElapsed > 0 ? bytesDelta / timeElapsed : 0;
        
        // Calculate time remaining
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
      }, abortController);
      
      // Step 4: Confirm upload
      setUploads((prev) => {
        if (!prev[uploadId]) return prev;
        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            phase: 'confirming',
            progress: 95, // Show we're almost done
          },
        };
      });
      
      const confirmResponse = await fetch('/api/videos/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          filename: file.name,
          filesize: file.size,
          contentType: file.type,
          previewThumbnailData: previewThumbnail,
        }),
        credentials: 'include', // Include cookies with the request
        signal: abortController.signal,
      });
      
      if (!confirmResponse.ok) {
        try {
          const errorData = await confirmResponse.json();
          console.error('Confirm upload error response:', errorData);
          throw new Error(errorData.error?.message || `Failed to confirm upload: ${confirmResponse.status} ${confirmResponse.statusText}`);
        } catch (parseError) {
          console.error('Error parsing confirm response:', parseError);
          throw new Error(`Failed to confirm upload: ${confirmResponse.status} ${confirmResponse.statusText}`);
        }
      }
      
      const { data } = await confirmResponse.json();
      
      // Update state with success
      setUploads((prev) => {
        if (!prev[uploadId]) return prev;
        
        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            uploading: false,
            phase: 'complete',
            progress: 100,
            videoKey: data.key,
            bytesUploaded: file.size,
            timeRemaining: 0,
          },
        };
      });
      
      // Show success toast
      toast({
        title: 'Upload complete',
        description: `${file.name} has been uploaded successfully.`,
        variant: 'success',
      });
      
      return data;
    } catch (error: unknown) {
      // Don't update state if the upload was cancelled
      if (error instanceof Error && error.name === 'AbortError') {
        return Promise.reject(error);
      }

      const friendlyMessage = normalizeUploadError(error);

      // Update state with error (store normalized message for UI)
      setUploads((prev) => {
        if (!prev[uploadId]) return prev;

        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            uploading: false,
            phase: 'error',
            error: new Error(friendlyMessage),
          },
        };
      });

      // Show error toast
      toast({
        title: 'Upload failed',
        description: friendlyMessage,
        variant: 'error',
      });

      return Promise.reject(new Error(friendlyMessage));
    }
  };
  
  /**
   * Cancel an ongoing upload
   * 
   * @param uploadId The ID of the upload to cancel
   */
  const cancelUpload = (uploadId: string) => {
    const upload = uploads[uploadId];
    
    if (upload && upload.uploading && upload.abortController) {
      // Abort the fetch requests
      upload.abortController.abort();
      
      // Update state
      setUploads((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          uploading: false,
          phase: 'error',
          error: new Error('Upload cancelled'),
        },
      }));
      
      // Show toast
      toast({
        title: 'Upload cancelled',
        description: `${upload.file.name} upload was cancelled.`,
        variant: 'info',
      });
    }
  };
  
  /**
   * Get the state of a specific upload
   * 
   * @param uploadId The ID of the upload
   * @returns The upload state or undefined if not found
   */
  const getUploadState = (uploadId: string): UploadState | undefined => {
    return uploads[uploadId];
  };
  
  /**
   * Remove an upload from the state
   * 
   * @param uploadId The ID of the upload to remove
   */
  const clearUpload = (uploadId: string) => {
    setUploads((prev) => {
      const newState = { ...prev };
      delete newState[uploadId];
      return newState;
    });
  };
  
  /**
   * Helper function to upload a file to Wasabi using a pre-signed URL
   * 
   * @param url The pre-signed URL
   * @param fields The fields to include in the form data
   * @param file The file to upload
   * @param onProgress Callback for progress updates with bytes information
   * @param abortController AbortController for cancelling the upload
   */
  const uploadToWasabi = async (
    url: string,
    fields: Record<string, string>,
    file: File,
    onProgress: (progress: number, bytesUploaded: number, totalBytes: number) => void,
    abortController?: AbortController
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress, event.loaded, event.total);
        }
      });
      
      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });
      
      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });
      
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });
      
      // Create form data with fields from pre-signed URL
      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file);
      
      // Send the request
      xhr.open('POST', url);
      xhr.send(formData);
      
      // Handle abort if abortController is provided
      if (abortController) {
        abortController.signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }
    });
  };
  
  return {
    uploadVideo,
    cancelUpload,
    getUploadState,
    clearUpload,
    uploads,
  };
}
