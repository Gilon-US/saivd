/**
 * Watermarking Service Client
 * 
 * This module provides functions to interact with the external watermarking service API.
 * It handles authentication, request formatting, error handling, and retry logic.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { backOff } from 'exponential-backoff';

/**
 * Create axios instance for watermarking service with authentication and default settings
 */
const watermarkApiClient: AxiosInstance = axios.create({
  baseURL: process.env.WATERMARK_SERVICE_URL,
  headers: {
    'Authorization': `Bearer ${process.env.WATERMARK_SERVICE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 seconds
});

/**
 * Options for watermarking a video
 */
export type WatermarkOptions = {
  position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number; // 0.0 to 1.0
  scale?: number; // 0.0 to 1.0
  text?: string; // Optional text to include in watermark
};

/**
 * Request parameters for watermarking a video
 */
export type WatermarkRequest = {
  videoUrl: string; // URL of the video to watermark
  callbackUrl: string; // URL to call when watermarking is complete
  options?: WatermarkOptions; // Watermarking options
};

/**
 * Response from watermarking request
 */
export type WatermarkResponse = {
  jobId: string; // ID of the watermarking job
  estimatedProcessingTime: number; // in seconds
};

/**
 * Response from watermarking status check
 */
export type WatermarkStatusResponse = {
  jobId: string; // ID of the watermarking job
  status: 'pending' | 'processing' | 'completed' | 'error'; // Status of the job
  progress?: number; // Progress percentage (0-100)
  result?: {
    videoUrl?: string; // URL of the watermarked video
    thumbnailUrl?: string; // URL of the watermarked thumbnail
  };
  error?: {
    code: string; // Error code
    message: string; // Error message
  };
};

/**
 * Request watermarking for a video
 * 
 * @param videoUrl URL of the video to watermark
 * @param callbackUrl URL to call when watermarking is complete
 * @param options Watermarking options
 * @returns Promise resolving to watermarking job details
 */
export async function requestWatermarking(
  videoUrl: string,
  callbackUrl: string,
  options?: WatermarkOptions
): Promise<WatermarkResponse> {
  try {
    // Validate inputs
    if (!videoUrl) throw new Error('Video URL is required');
    if (!callbackUrl) throw new Error('Callback URL is required');
    
    // Default options
    const defaultOptions: WatermarkOptions = {
      position: 'bottom-right',
      opacity: 0.5,
      scale: 0.3,
    };
    
    // Merge with provided options
    const mergedOptions = { ...defaultOptions, ...options };
    
    // Log request (for debugging)
    console.log('Requesting watermarking:', { videoUrl, callbackUrl, options: mergedOptions });
    
    // Make API request with retry logic
    const response = await backOff(() => watermarkApiClient.post<WatermarkResponse>('/watermark', {
      videoUrl,
      callbackUrl,
      options: mergedOptions,
    }), {
      numOfAttempts: 3,
      startingDelay: 1000,
      timeMultiple: 2,
      retry: (error: Error) => {
        // Only retry on network errors or 5xx server errors
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          return !axiosError.response || (axiosError.response?.status ?? 0) >= 500;
        }
        return false;
      },
    });
    
    return response.data;
  } catch (error) {
    // Handle different error types
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      if (axiosError.response) {
        // Server responded with error status
        const status = axiosError.response.status;
        const message = (axiosError.response.data as { message?: string })?.message || 'Unknown server error';
        
        if (status === 401 || status === 403) {
          throw new Error(`Authentication failed: ${message}`);
        } else if (status === 400) {
          throw new Error(`Invalid request: ${message}`);
        } else if (status >= 500) {
          throw new Error(`Watermarking service error: ${message}`);
        } else {
          throw new Error(`Request failed with status ${status}: ${message}`);
        }
      } else if (axiosError.request) {
        // No response received
        throw new Error('No response from watermarking service');
      } else {
        // Request setup error
        throw new Error(`Request error: ${axiosError.message}`);
      }
    } else {
      // Non-Axios error
      throw error;
    }
  }
}

/**
 * Check the status of a watermarking job
 * 
 * @deprecated This function uses the old `/status/{jobId}` endpoint which has been removed.
 * Use `/api/videos/watermark/status` instead, which uses the new `/queue_status` endpoint.
 * 
 * @param _jobId ID of the watermarking job (unused, function is deprecated)
 * @returns Promise resolving to watermarking job status
 */
export async function checkWatermarkingStatus(_jobId: string): Promise<WatermarkStatusResponse> {
  // This function is deprecated - the old `/status/{jobId}` endpoint no longer exists.
  // The new API uses `/queue_status` which returns all jobs at once.
  // Use the Next.js API route `/api/videos/watermark/status` instead.
  throw new Error(
    'checkWatermarkingStatus is deprecated. The old `/status/{jobId}` endpoint has been removed. ' +
    'Use `/api/videos/watermark/status` which uses the new `/queue_status` endpoint instead.'
  );
}

/**
 * Utility function to generate callback URL with token
 * 
 * @param token Security token for callback authentication
 * @returns Callback URL
 */
export function generateCallbackUrl(token: string): string {
  if (!token) throw new Error('Token is required');
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/callbacks/watermark?token=${encodeURIComponent(token)}`;
}

/**
 * Utility function to parse watermarking error responses
 * 
 * @param error Error from watermarking API
 * @returns Formatted error message
 */
export function parseWatermarkingError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    
    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = (axiosError.response.data as { message?: string })?.message || 'Unknown server error';
      
      return `Watermarking service error (${status}): ${message}`;
    } else if (axiosError.request) {
      return 'No response from watermarking service';
    } else {
      return `Request error: ${axiosError.message}`;
    }
  } else if (error instanceof Error) {
    return error.message;
  } else {
    return 'Unknown error';
  }
}
