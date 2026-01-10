"use client";

import {useEffect, useState, useRef, RefObject} from "react";

/**
 * Frame data passed to the analysis function
 */
export interface FrameData {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  imageData: ImageData;
  timestamp: number;
  videoTime: number;
}

/**
 * Frame analysis function type
 * Returns a QR code URL string to display as an overlay, or null if no
 * overlay should be shown.
 */
export type FrameAnalysisFunction = (frameData: FrameData) => string | null;

/**
 * Default placeholder frame analysis function
 * This will be replaced with actual analysis logic in the future
 *
 * @param frameData - The current frame data
 * @returns string | null - QR code URL or null if no overlay
 */
const defaultAnalysisFunction: FrameAnalysisFunction = (_frameData: FrameData): string | null => {
  // Placeholder implementation
  // Future implementations could include:
  // - Face detection
  // - Object recognition
  // - Watermark verification
  // - Content moderation
  // - Quality analysis

  // For now, return false (don't show overlay)
  return null;
};

/**
 * Custom hook for analyzing video frames in real-time
 *
 * @param videoRef - Reference to the video element
 * @param isPlaying - Whether the video is currently playing
 * @param analysisFunction - Optional custom analysis function
 * @param videoId - Optional video ID for user ID extraction (required for watermarked videos)
 * @returns Object containing qrUrl and showOverlay state
 */
export function useFrameAnalysis(
  videoRef: RefObject<HTMLVideoElement | null>,
  isPlaying: boolean,
  analysisFunction: FrameAnalysisFunction = defaultAnalysisFunction,
  videoId?: string
) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [extractedUserId, setExtractedUserId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const skipPixelReadRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastExtractionFrameRef = useRef(-1);
  const isExtractingRef = useRef(false);

  useEffect(() => {
    // Initialize canvas for frame capture
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      contextRef.current = canvasRef.current.getContext("2d", {
        willReadFrequently: true,
      });
    }

    const analyzeFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = contextRef.current;

      if (!video || !canvas || !context || video.paused || video.ended) {
        return;
      }

      let imageData: ImageData;

      if (skipPixelReadRef.current) {
        // When we've previously detected a tainted canvas, avoid touching
        // getImageData again and just provide a minimal dummy image.
        imageData = new ImageData(1, 1);
      } else {
        try {
          // Set canvas size to match video
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          // Draw current video frame to canvas
          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Get image data – this may throw a SecurityError if the video
          // source is cross-origin without proper CORS headers.
          imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        } catch (error) {
          if (error instanceof DOMException && error.name === "SecurityError") {
            console.warn(
              "Frame analysis: canvas is tainted by cross-origin video; skipping pixel reads and using dummy frame data instead."
            );
            skipPixelReadRef.current = true;
            imageData = new ImageData(1, 1);
          } else {
            throw error;
          }
        }
      }

      // Prepare frame data
      const frameData: FrameData = {
        canvas,
        context,
        imageData,
        timestamp: performance.now(),
        videoTime: video.currentTime,
      };

      // If we have a videoId, extract user ID every 20 frames
      if (videoId && !isExtractingRef.current) {
        frameCountRef.current += 1;
        
        // Extract user ID every 20 frames (check if we should extract on this frame)
        if (frameCountRef.current - lastExtractionFrameRef.current >= 20) {
          // Use the actual frame count as the frame index
          const frameIndex = frameCountRef.current;
          
          isExtractingRef.current = true;
          lastExtractionFrameRef.current = frameCountRef.current;
          
          // Call API to extract user ID (don't await - fire and forget to avoid blocking)
          fetch(`/api/videos/${videoId}/extract-user-id?frame_index=${frameIndex}`)
            .then(async (response) => {
              if (!response.ok) {
                console.warn("[FrameAnalysis] Failed to extract user ID", response.status);
                return;
              }
              const data = await response.json();
              if (data.success && data.data?.user_id) {
                setExtractedUserId(data.data.user_id);
                console.log("[FrameAnalysis] Extracted user ID:", data.data.user_id);
              }
            })
            .catch((error) => {
              console.error("[FrameAnalysis] Error extracting user ID:", error);
            })
            .finally(() => {
              isExtractingRef.current = false;
            });
        }
      }

      // Note: QR URL is set in a separate useEffect that watches extractedUserId
      // If we have a videoId, we're using user ID extraction, so don't use analysis function
      // Only use analysis function when videoId is not provided (fallback mode)
      if (!videoId) {
        // Call analysis function and update overlay QR URL (only when not using user ID extraction)
        try {
          const nextQrUrl = analysisFunction(frameData);
          setQrUrl(nextQrUrl);
        } catch (error) {
          console.error("Error in frame analysis:", error);
          setQrUrl(null);
        }
      }
      // If videoId is provided, the QR URL will be set by the useEffect that watches extractedUserId

      // Schedule next frame analysis
      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(analyzeFrame);
      }
    };

    // Start analysis loop when playing
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(analyzeFrame);
    }

    // Cleanup
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [videoRef, isPlaying, analysisFunction, videoId]);

  // Reset overlay and frame count when video stops
  useEffect(() => {
    if (!isPlaying) {
      setQrUrl(null);
      frameCountRef.current = 0;
      lastExtractionFrameRef.current = -1;
      isExtractingRef.current = false;
    }
  }, [isPlaying]);

  // Reset extracted user ID when video ID changes
  useEffect(() => {
    setExtractedUserId(null);
    frameCountRef.current = 0;
    lastExtractionFrameRef.current = -1;
    isExtractingRef.current = false;
  }, [videoId]);

  // Update QR URL when extractedUserId changes
  useEffect(() => {
    if (videoId && extractedUserId) {
      const qrUrlFromUserId = `/profile/${extractedUserId}/qr`;
      setQrUrl(qrUrlFromUserId);
      console.log("[FrameAnalysis] Setting QR URL from extracted user ID:", qrUrlFromUserId);
    } else if (!videoId) {
      // Clear QR URL if videoId is removed
      setQrUrl(null);
    }
  }, [videoId, extractedUserId]);

  return {qrUrl, showOverlay: qrUrl !== null};
}
