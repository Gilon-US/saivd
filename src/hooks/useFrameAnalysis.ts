'use client';

import { useEffect, useState, useRef, RefObject } from 'react';

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
 * Returns a boolean indicating whether to show the overlay
 */
export type FrameAnalysisFunction = (frameData: FrameData) => boolean;

/**
 * Default placeholder frame analysis function
 * This will be replaced with actual analysis logic in the future
 * 
 * @param frameData - The current frame data
 * @returns boolean - Whether to show the overlay
 */
const defaultAnalysisFunction: FrameAnalysisFunction = (frameData: FrameData): boolean => {
  // Placeholder implementation
  // Future implementations could include:
  // - Face detection
  // - Object recognition
  // - Watermark verification
  // - Content moderation
  // - Quality analysis
  
  // For now, return false (don't show overlay)
  return false;
};

/**
 * Custom hook for analyzing video frames in real-time
 * 
 * @param videoRef - Reference to the video element
 * @param isPlaying - Whether the video is currently playing
 * @param analysisFunction - Optional custom analysis function
 * @returns Object containing showOverlay state
 */
export function useFrameAnalysis(
  videoRef: RefObject<HTMLVideoElement | null>,
  isPlaying: boolean,
  analysisFunction: FrameAnalysisFunction = defaultAnalysisFunction
) {
  const [showOverlay, setShowOverlay] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialize canvas for frame capture
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      contextRef.current = canvasRef.current.getContext('2d', {
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

      // Set canvas size to match video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      // Draw current video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get image data
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

      // Prepare frame data
      const frameData: FrameData = {
        canvas,
        context,
        imageData,
        timestamp: performance.now(),
        videoTime: video.currentTime,
      };

      // Call analysis function and update overlay state
      try {
        const shouldShowOverlay = analysisFunction(frameData);
        setShowOverlay(shouldShowOverlay);
      } catch (error) {
        console.error('Error in frame analysis:', error);
        setShowOverlay(false);
      }

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
  }, [videoRef, isPlaying, analysisFunction]);

  // Reset overlay when video stops
  useEffect(() => {
    if (!isPlaying) {
      setShowOverlay(false);
    }
  }, [isPlaying]);

  return { showOverlay };
}
