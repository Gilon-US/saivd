# Story 3.5: Implement Video Player with Frame Analysis

## Status
Ready for Review

## Story
**As a** user,
**I want** to view watermarked videos in a dedicated video player,
**so that** I can watch my videos with real-time frame analysis and overlay feedback.

## Acceptance Criteria
1. Clicking a watermarked video opens a video player modal/view
2. Video player displays the watermarked video with standard playback controls
3. Frame analysis function is called for each video frame during playback
4. Overlay shows/hides based on the boolean return value from frame analysis
5. Video player includes standard controls (play/pause, seek, volume, fullscreen)
6. Player is responsive and works on mobile devices
7. Frame analysis function has a clean interface for future extensibility

## Tasks / Subtasks
- [x] Create video player component (AC: 1, 2, 5, 6)
  - [x] Design video player modal/view UI
  - [x] Implement video element with controls
  - [x] Add responsive styling for mobile
  - [x] Implement close/dismiss functionality
- [x] Implement frame analysis hook (AC: 3, 7)
  - [x] Create custom hook for frame analysis
  - [x] Set up requestAnimationFrame loop for frame capture
  - [x] Extract frame data from video element
  - [x] Call analysis function with frame data
  - [x] Handle cleanup on unmount
- [x] Create frame analysis function interface (AC: 3, 7)
  - [x] Define TypeScript interface for frame analysis
  - [x] Implement placeholder analysis function
  - [x] Add documentation for future implementation
  - [x] Ensure function is easily replaceable
- [x] Implement conditional overlay (AC: 4)
  - [x] Create overlay component
  - [x] Connect overlay visibility to analysis result
  - [x] Add smooth show/hide transitions
  - [x] Style overlay appropriately
- [x] Integrate player with video grid (AC: 1)
  - [x] Add click handler to watermarked video thumbnails
  - [x] Pass video URL to player component
  - [x] Manage player open/close state
- [x] Add video player controls (AC: 5)
  - [x] Implement custom controls or use native controls
  - [x] Add play/pause button
  - [x] Add seek bar
  - [x] Add volume control
  - [x] Add fullscreen toggle
- [x] Test video player functionality (All AC)
  - [x] Test video playback
  - [x] Verify frame analysis is called correctly
  - [x] Test overlay show/hide behavior
  - [x] Test on different screen sizes
  - [x] Test with different video formats

## Dev Notes

### Previous Story Insights
Story 3.1-3.4 implemented watermarking integration and display. This story adds the ability to view watermarked videos in a dedicated player with frame-by-frame analysis capability for future AI/ML features.

### Data Models
No new database models required. This story uses existing watermarked video data.

### Component Specifications

**Video Player Component**
```typescript
// src/components/VideoPlayer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { useFrameAnalysis } from '@/hooks/useFrameAnalysis';

interface VideoPlayerProps {
  videoUrl: string;
  onClose: () => void;
  isOpen: boolean;
}

export function VideoPlayer({ videoUrl, onClose, isOpen }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Frame analysis hook
  const { showOverlay } = useFrameAnalysis(videoRef, isPlaying);

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isOpen]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="relative w-full max-w-5xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
          aria-label="Close video player"
        >
          <X className="w-8 h-8" />
        </button>

        {/* Video container */}
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full aspect-video"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
          />

          {/* Conditional overlay */}
          {showOverlay && (
            <div className="absolute inset-0 bg-red-500/30 border-4 border-red-500 pointer-events-none transition-opacity duration-200">
              <div className="absolute top-4 left-4 bg-red-500 text-white px-4 py-2 rounded-lg font-semibold">
                Analysis Alert
              </div>
            </div>
          )}

          {/* Custom controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            {/* Seek bar */}
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full mb-4 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />

            {/* Control buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlay}
                  className="text-white hover:text-gray-300 transition-colors"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </button>

                <button
                  onClick={toggleMute}
                  className="text-white hover:text-gray-300 transition-colors"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-6 h-6" />
                  ) : (
                    <Volume2 className="w-6 h-6" />
                  )}
                </button>

                <span className="text-white text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-gray-300 transition-colors"
                aria-label="Fullscreen"
              >
                <Maximize className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

**Frame Analysis Hook**
```typescript
// src/hooks/useFrameAnalysis.ts
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
  videoRef: RefObject<HTMLVideoElement>,
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
```

**Integration Example**
```typescript
// src/app/dashboard/page.tsx (example integration)
'use client';

import { useState } from 'react';
import { VideoPlayer } from '@/components/VideoPlayer';

export default function Dashboard() {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  const handleVideoClick = (videoUrl: string) => {
    setSelectedVideo(videoUrl);
    setIsPlayerOpen(true);
  };

  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
    setSelectedVideo(null);
  };

  return (
    <div>
      {/* Video grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Example video thumbnail */}
        <div
          onClick={() => handleVideoClick('https://example.com/video.mp4')}
          className="cursor-pointer hover:opacity-80 transition-opacity"
        >
          <img src="/thumbnail.jpg" alt="Video thumbnail" />
        </div>
      </div>

      {/* Video player */}
      {selectedVideo && (
        <VideoPlayer
          videoUrl={selectedVideo}
          onClose={handleClosePlayer}
          isOpen={isPlayerOpen}
        />
      )}
    </div>
  );
}
```

### File Locations
- **Video Player Component**: `src/components/VideoPlayer.tsx`
- **Frame Analysis Hook**: `src/hooks/useFrameAnalysis.ts`
- **Type Definitions**: `src/types/video.ts` (if needed)

### Testing Requirements
- Unit tests for frame analysis hook
- Component tests for video player
- Test cases should cover:
  - Video playback controls
  - Frame analysis function calling
  - Overlay show/hide behavior
  - Responsive behavior
  - Edge cases (video load errors, missing video)

### Technical Constraints
- Use React hooks for state management
- Implement frame analysis using requestAnimationFrame for performance
- Use canvas API for frame capture
- Ensure video player is accessible (keyboard navigation, ARIA labels)
- Optimize frame analysis to avoid performance issues
- Support common video formats (MP4, WebM)
- Handle video loading states and errors gracefully

### Performance Considerations
- Frame analysis runs on every animation frame (~60fps)
- Canvas operations should be optimized
- Consider throttling analysis function if performance issues arise
- Use `willReadFrequently` context option for canvas
- Clean up animation frames on unmount

### Future Extensibility
The frame analysis function interface is designed to be easily extended:
- Face detection and recognition
- Watermark verification
- Content moderation
- Quality analysis
- Object detection
- Scene classification

## Testing
- Unit tests for `useFrameAnalysis` hook
- Component tests for `VideoPlayer`
- Integration tests for video grid to player flow
- Test cases:
  - Video playback and controls
  - Frame analysis function is called correctly
  - Overlay visibility based on analysis result
  - Responsive design on mobile
  - Error handling for invalid video URLs
  - Cleanup on component unmount

## File List
- src/components/video/VideoPlayer.tsx (new)
- src/hooks/useFrameAnalysis.ts (new)
- src/components/video/__tests__/VideoPlayer.test.tsx (new)
- src/hooks/__tests__/useFrameAnalysis.test.ts (new)
- src/components/video/VideoGrid.tsx (modified)

## Dependencies
No new dependencies required. Uses existing:
- React hooks
- lucide-react (for icons)
- Tailwind CSS (for styling)

## Dev Agent Record

### Agent Model Used
Claude 3.5 Sonnet (cascade)

### Debug Log
No issues encountered during implementation.

### Completion Notes
- Implemented VideoPlayer component with full playback controls (play/pause, seek, volume, fullscreen)
- Created useFrameAnalysis hook with requestAnimationFrame for real-time frame analysis
- Defined extensible FrameAnalysisFunction interface for future AI/ML integration
- Integrated conditional overlay that responds to frame analysis results
- Updated VideoGrid to open VideoPlayer on video thumbnail clicks
- Created comprehensive test suites for both VideoPlayer and useFrameAnalysis
- All acceptance criteria met
- Component is responsive and accessible with proper ARIA labels
- Frame analysis runs at ~60fps using requestAnimationFrame
- Placeholder analysis function returns false by default (no overlay shown)
- Clean separation of concerns allows easy replacement of analysis logic

### Change Log
| Date       | Version | Description       | Author |
|------------|---------|-------------------|--------|
| 2025-11-07 | 1.0     | Initial draft     | PM     |
| 2025-11-07 | 2.0     | Implementation complete | James (Dev) |
