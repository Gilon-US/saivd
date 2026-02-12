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
    width: maxWidth = 240,
    height: maxHeight = 135, // Default max dimensions (16:9)
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

    // Set video attributes for better compatibility with MOV files
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let hasCaptured = false;
    let objectUrl: string | null = null;

    // Handle video loading errors
    video.onerror = (_e) => {
      const error = video.error;
      const errorMsg = error 
        ? `Failed to load video file: ${error.message || `Error code ${error.code}`}`
        : 'Failed to load video file';
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error(errorMsg));
    };

    // When metadata is loaded, we can seek to the desired time
    video.onloadedmetadata = () => {
      try {
        // Calculate seek time - use at least 0.5 seconds to avoid keyframe issues
        // (MOV files and some MP4 files have keyframes that may not be at the very start)
        let targetTime = seekTime < 1 
          ? video.duration * seekTime  // Percentage of duration
          : Math.min(seekTime, video.duration); // Absolute time in seconds
        
        // Ensure minimum seek time of 0.5 seconds for better keyframe compatibility
        // But don't exceed video duration
        targetTime = Math.max(0.5, Math.min(targetTime, video.duration - 0.1));

        video.currentTime = targetTime;
      } catch (_err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to seek video'));
      }
    };

    // Wait for the frame to be fully decoded after seeking
    // This is critical for MOV files which may have frame decoding delays
    const captureFrame = () => {
      if (hasCaptured) return; // Prevent multiple captures
      hasCaptured = true;

      try {
        // Ensure video dimensions are valid before drawing
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(new Error('Video dimensions are invalid'));
          return;
        }

        // Calculate canvas dimensions based on video's actual aspect ratio
        // Scale proportionally to fit within max dimensions while preserving aspect ratio
        const videoAspectRatio = video.videoWidth / video.videoHeight;
        const isPortrait = video.videoHeight > video.videoWidth;
        
        let canvasWidth: number;
        let canvasHeight: number;
        
        // Scale the video dimensions to fit within max bounds while preserving aspect ratio
        if (isPortrait) {
          // Portrait video: fit to max height, calculate width
          canvasHeight = maxHeight;
          canvasWidth = maxHeight * videoAspectRatio;
          
          // If calculated width exceeds max width, fit to width instead
          if (canvasWidth > maxWidth) {
            canvasWidth = maxWidth;
            canvasHeight = maxWidth / videoAspectRatio;
          }
        } else {
          // Landscape video: fit to max width, calculate height
          canvasWidth = maxWidth;
          canvasHeight = maxWidth / videoAspectRatio;
          
          // If calculated height exceeds max height, fit to height instead
          if (canvasHeight > maxHeight) {
            canvasHeight = maxHeight;
            canvasWidth = maxHeight * videoAspectRatio;
          }
        }
        
        // Ensure dimensions are integers for better rendering
        canvasWidth = Math.round(canvasWidth);
        canvasHeight = Math.round(canvasHeight);
        
        // Ensure minimum dimensions
        canvasWidth = Math.max(1, canvasWidth);
        canvasHeight = Math.max(1, canvasHeight);
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Use requestAnimationFrame to ensure the frame is fully rendered
        requestAnimationFrame(() => {
          try {
            // Draw the video frame to canvas at its natural aspect ratio
            // This will fit the video within the canvas bounds without stretching
            ctx.drawImage(
              video,
              0, 0, video.videoWidth, video.videoHeight,  // Source rectangle (full video)
              0, 0, canvasWidth, canvasHeight              // Destination rectangle (scaled to fit)
            );
            
            // Convert canvas to base64 data URL
            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', quality);
            
            // Clean up
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            
            resolve(thumbnailDataUrl);
          } catch (err) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to generate thumbnail: ' + (err instanceof Error ? err.message : 'Unknown error')));
          }
        });
      } catch (_err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to capture frame'));
      }
    };

    // When we've seeked to the target time, wait a bit for frame to decode
    // This delay is especially important for MOV files with certain codecs
    // where the frame might not be fully decoded immediately after seeking
    video.onseeked = () => {
      // Add a small delay to ensure the frame is fully decoded
      // 100ms should be enough for most codecs, including MOV files
      setTimeout(captureFrame, 100);
    };

    // Load the video file
    try {
      objectUrl = URL.createObjectURL(videoFile);
      video.src = objectUrl;
      video.load();
    } catch (_err) {
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
