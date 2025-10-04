/**
 * Utility functions for generating video thumbnails in the browser
 */

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  seekTime?: number; // Time in seconds to seek to, or percentage if < 1
}

/**
 * Generates a thumbnail from a video file using browser APIs
 * @param videoFile The video file to generate thumbnail from
 * @param options Thumbnail generation options
 * @returns Promise that resolves to base64 data URL of the thumbnail
 */
export function generateVideoThumbnail(
  videoFile: File, 
  options: ThumbnailOptions = {}
): Promise<string> {
  const {
    width = 240,
    height = 135, // 16:9 aspect ratio
    quality = 0.8,
    seekTime = 0.1 // Default to 10% of video duration
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    // Set canvas dimensions
    canvas.width = width;
    canvas.height = height;

    // Handle video loading errors
    video.onerror = () => {
      reject(new Error('Failed to load video file'));
    };

    // When metadata is loaded, we can seek to the desired time
    video.onloadedmetadata = () => {
      try {
        // Calculate seek time
        const targetTime = seekTime < 1 
          ? video.duration * seekTime  // Percentage of duration
          : Math.min(seekTime, video.duration); // Absolute time in seconds

        video.currentTime = targetTime;
      } catch {
        reject(new Error('Failed to seek video'));
      }
    };

    // When we've seeked to the target time, capture the frame
    video.onseeked = () => {
      try {
        // Draw the video frame to canvas
        ctx.drawImage(video, 0, 0, width, height);
        
        // Convert canvas to base64 data URL
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', quality);
        
        // Clean up
        URL.revokeObjectURL(video.src);
        
        resolve(thumbnailDataUrl);
      } catch {
        reject(new Error('Failed to generate thumbnail'));
      }
    };

    // Load the video file
    try {
      video.src = URL.createObjectURL(videoFile);
      video.load();
    } catch {
      reject(new Error('Failed to create video object URL'));
    }
  });
}

/**
 * Generates multiple thumbnails at different time points
 * @param videoFile The video file to generate thumbnails from
 * @param timePoints Array of time points (in seconds or percentages if < 1)
 * @param options Thumbnail generation options
 * @returns Promise that resolves to array of base64 data URLs
 */
export async function generateMultipleThumbnails(
  videoFile: File,
  timePoints: number[] = [0.1, 0.5, 0.9],
  options: Omit<ThumbnailOptions, 'seekTime'> = {}
): Promise<string[]> {
  const thumbnails: string[] = [];
  
  for (const timePoint of timePoints) {
    try {
      const thumbnail = await generateVideoThumbnail(videoFile, {
        ...options,
        seekTime: timePoint
      });
      thumbnails.push(thumbnail);
    } catch (err) {
      console.warn(`Failed to generate thumbnail at time ${timePoint}:`, err);
      // Continue with other thumbnails even if one fails
    }
  }
  
  return thumbnails;
}

/**
 * Gets basic video metadata without generating thumbnails
 * @param videoFile The video file to analyze
 * @returns Promise with video metadata
 */
export function getVideoMetadata(videoFile: File): Promise<{
  duration: number;
  width: number;
  height: number;
  aspectRatio: number;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    
    video.onerror = () => {
      reject(new Error('Failed to load video file'));
    };
    
    video.onloadedmetadata = () => {
      try {
        const metadata = {
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          aspectRatio: video.videoWidth / video.videoHeight
        };
        
        URL.revokeObjectURL(video.src);
        resolve(metadata);
      } catch {
        reject(new Error('Failed to read video metadata'));
      }
    };
    
    try {
      video.src = URL.createObjectURL(videoFile);
      video.load();
    } catch {
      reject(new Error('Failed to create video object URL'));
    }
  });
}
