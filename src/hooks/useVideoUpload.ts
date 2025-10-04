import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/hooks/useToast';
import { generateVideoThumbnail } from '@/utils/videoThumbnail';

/**
 * Upload state for a single video upload
 */
export type UploadState = {
  id: string;
  progress: number;
  uploading: boolean;
  error: Error | null;
  videoKey: string | null;
  file: File;
  abortController?: AbortController;
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
    
    // Initialize upload state
    setUploads((prev) => ({
      ...prev,
      [uploadId]: {
        id: uploadId,
        progress: 0,
        uploading: true,
        error: null,
        videoKey: null,
        file,
        abortController,
      },
    }));
    
    try {
      // Step 1: Generate thumbnail from video file
      let previewThumbnail: string | null = null;
      try {
        previewThumbnail = await generateVideoThumbnail(file);
        console.log('Generated thumbnail for', file.name);
      } catch (thumbnailError) {
        console.warn('Failed to generate thumbnail:', thumbnailError);
        // Continue with upload even if thumbnail generation fails
      }

      // Step 2: Get pre-signed URL
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
      
      // Step 2: Upload file directly to Wasabi
      await uploadToWasabi(uploadUrl, fields, file, (progress) => {
        setUploads((prev) => {
          if (!prev[uploadId]) return prev;
          
          return {
            ...prev,
            [uploadId]: {
              ...prev[uploadId],
              progress,
            },
          };
        });
      }, abortController);
      
      // Step 3: Confirm upload
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
            progress: 100,
            videoKey: data.key,
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
      
      // Update state with error
      setUploads((prev) => {
        if (!prev[uploadId]) return prev;
        
        return {
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            uploading: false,
            error: error instanceof Error ? error : new Error(
            typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message: unknown }).message)
              : 'Unknown error'
          ),
          },
        };
      });
      
      // Show error toast
      toast({
        title: 'Upload failed',
        description: error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: unknown }).message)
            : 'An error occurred during upload.',
        variant: 'error',
      });
      
      return Promise.reject(error);
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
   * @param onProgress Callback for progress updates
   * @param abortController AbortController for cancelling the upload
   */
  const uploadToWasabi = async (
    url: string,
    fields: Record<string, string>,
    file: File,
    onProgress: (progress: number) => void,
    abortController?: AbortController
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
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
