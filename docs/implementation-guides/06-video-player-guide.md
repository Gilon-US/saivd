# Video Player with Frame Analysis Guide

This guide covers the implementation of a video player with real-time frame analysis capability for the SAVD App. The player allows users to view watermarked videos while performing per-frame analysis for future AI/ML features.

## Overview

The video player component provides a full-featured viewing experience with standard playback controls and a unique frame analysis system. The frame analysis runs on every video frame during playback, allowing for future implementation of features like watermark verification, content moderation, or object detection.

## Prerequisites

- Next.js 15+ with React 19+
- TypeScript
- Tailwind CSS
- lucide-react for icons
- Existing watermarked video URLs

## Architecture

### Component Structure

```
VideoPlayer (Component)
├── Video Element
├── Custom Controls
│   ├── Play/Pause
│   ├── Seek Bar
│   ├── Volume Control
│   └── Fullscreen Toggle
├── Conditional Overlay
└── useFrameAnalysis Hook
    ├── Canvas for frame capture
    ├── requestAnimationFrame loop
    └── Frame analysis function
```

### Data Flow

1. User clicks watermarked video thumbnail
2. Video player modal opens with video URL
3. Video begins playback
4. `useFrameAnalysis` hook starts frame capture loop
5. Each frame is drawn to canvas and analyzed
6. Analysis function returns boolean
7. Overlay shows/hides based on result
8. Loop continues until video pauses/ends

## Implementation Steps

### 1. Create Frame Analysis Hook

The frame analysis hook is the core of the system. It captures video frames and calls an analysis function.

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
 */
const defaultAnalysisFunction: FrameAnalysisFunction = (frameData: FrameData): boolean => {
  // Placeholder - returns false by default
  // Future implementations:
  // - Face detection
  // - Watermark verification
  // - Content moderation
  // - Object recognition
  return false;
};

/**
 * Custom hook for analyzing video frames in real-time
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

### 2. Create Video Player Component

The video player component provides the UI and controls.

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

### 3. Integrate with Video Grid

Add click handlers to watermarked video thumbnails to open the player.

```typescript
// src/app/dashboard/page.tsx (example)
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
        {videos.map((video) => (
          <div
            key={video.id}
            onClick={() => handleVideoClick(video.watermarkedUrl)}
            className="cursor-pointer hover:opacity-80 transition-opacity"
          >
            <img src={video.thumbnailUrl} alt={video.title} />
            <h3>{video.title}</h3>
          </div>
        ))}
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

### 4. Create Custom Analysis Function (Future)

When ready to implement actual analysis, create a custom function:

```typescript
// src/lib/videoAnalysis.ts
import { FrameAnalysisFunction, FrameData } from '@/hooks/useFrameAnalysis';

/**
 * Example: Detect if frame is too dark
 */
export const detectDarkFrame: FrameAnalysisFunction = (frameData: FrameData): boolean => {
  const { imageData } = frameData;
  const pixels = imageData.data;
  
  let totalBrightness = 0;
  const pixelCount = pixels.length / 4;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = (r + g + b) / 3;
    totalBrightness += brightness;
  }
  
  const averageBrightness = totalBrightness / pixelCount;
  
  // Show overlay if frame is too dark (average brightness < 50)
  return averageBrightness < 50;
};

/**
 * Example: Detect red color dominance
 */
export const detectRedDominance: FrameAnalysisFunction = (frameData: FrameData): boolean => {
  const { imageData } = frameData;
  const pixels = imageData.data;
  
  let redPixels = 0;
  const pixelCount = pixels.length / 4;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    
    // Consider pixel "red" if red channel is dominant
    if (r > g + 50 && r > b + 50) {
      redPixels++;
    }
  }
  
  const redPercentage = (redPixels / pixelCount) * 100;
  
  // Show overlay if more than 30% of pixels are red
  return redPercentage > 30;
};

/**
 * Example: Watermark verification (placeholder)
 */
export const verifyWatermark: FrameAnalysisFunction = (frameData: FrameData): boolean => {
  // Future implementation:
  // - Extract watermark region
  // - Compare with expected watermark
  // - Return true if watermark is missing or tampered
  
  return false;
};
```

Then use it in the VideoPlayer:

```typescript
import { detectDarkFrame } from '@/lib/videoAnalysis';

// In VideoPlayer component
const { showOverlay } = useFrameAnalysis(videoRef, isPlaying, detectDarkFrame);
```

## Performance Optimization

### 1. Throttle Analysis

If analysis is computationally expensive, throttle it:

```typescript
// src/hooks/useFrameAnalysis.ts
const analyzeFrame = () => {
  // ... existing code ...
  
  // Only analyze every Nth frame
  const frameSkip = 2; // Analyze every 2nd frame
  if (frameCount % frameSkip !== 0) {
    animationFrameRef.current = requestAnimationFrame(analyzeFrame);
    return;
  }
  
  // ... rest of analysis ...
};
```

### 2. Use Web Workers

For heavy analysis, offload to a Web Worker:

```typescript
// src/workers/frameAnalysis.worker.ts
self.onmessage = (e) => {
  const { imageData } = e.data;
  
  // Perform heavy analysis
  const result = performAnalysis(imageData);
  
  self.postMessage({ result });
};

// In useFrameAnalysis hook
const workerRef = useRef<Worker | null>(null);

useEffect(() => {
  workerRef.current = new Worker(
    new URL('../workers/frameAnalysis.worker.ts', import.meta.url)
  );
  
  workerRef.current.onmessage = (e) => {
    setShowOverlay(e.data.result);
  };
  
  return () => {
    workerRef.current?.terminate();
  };
}, []);
```

### 3. Canvas Optimization

```typescript
// Use willReadFrequently for better performance
const context = canvas.getContext('2d', {
  willReadFrequently: true,
  alpha: false, // If you don't need alpha channel
});
```

## Testing

### Unit Tests for Hook

```typescript
// src/hooks/__tests__/useFrameAnalysis.test.ts
import { renderHook } from '@testing-library/react';
import { useFrameAnalysis } from '../useFrameAnalysis';
import { RefObject } from 'react';

describe('useFrameAnalysis', () => {
  it('should return showOverlay as false by default', () => {
    const videoRef: RefObject<HTMLVideoElement> = { current: null };
    const { result } = renderHook(() => useFrameAnalysis(videoRef, false));
    
    expect(result.current.showOverlay).toBe(false);
  });
  
  it('should call analysis function when playing', async () => {
    const mockVideo = document.createElement('video');
    const videoRef: RefObject<HTMLVideoElement> = { current: mockVideo };
    const mockAnalysis = jest.fn(() => true);
    
    const { result } = renderHook(() => 
      useFrameAnalysis(videoRef, true, mockAnalysis)
    );
    
    // Wait for animation frame
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(mockAnalysis).toHaveBeenCalled();
  });
});
```

### Component Tests

```typescript
// src/components/__tests__/VideoPlayer.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoPlayer } from '../VideoPlayer';

describe('VideoPlayer', () => {
  it('should render when open', () => {
    render(
      <VideoPlayer
        videoUrl="https://example.com/video.mp4"
        onClose={() => {}}
        isOpen={true}
      />
    );
    
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });
  
  it('should not render when closed', () => {
    const { container } = render(
      <VideoPlayer
        videoUrl="https://example.com/video.mp4"
        onClose={() => {}}
        isOpen={false}
      />
    );
    
    expect(container.firstChild).toBeNull();
  });
  
  it('should call onClose when close button clicked', () => {
    const onClose = jest.fn();
    render(
      <VideoPlayer
        videoUrl="https://example.com/video.mp4"
        onClose={onClose}
        isOpen={true}
      />
    );
    
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });
});
```

## Accessibility

### Keyboard Navigation

Add keyboard shortcuts:

```typescript
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (!isOpen) return;
    
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime -= 5;
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime += 5;
        }
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };
  
  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, [isOpen, isPlaying]);
```

### ARIA Labels

All controls have appropriate ARIA labels for screen readers.

## Mobile Considerations

### Touch Controls

Add touch-friendly controls:

```typescript
const [showControls, setShowControls] = useState(true);
const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

const handleVideoClick = () => {
  if (isMobile) {
    setShowControls(true);
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }
  
  togglePlay();
};
```

### Responsive Styling

```css
/* Larger touch targets on mobile */
@media (max-width: 768px) {
  .video-controls button {
    min-width: 44px;
    min-height: 44px;
  }
}
```

## Error Handling

Add error handling for video loading:

```typescript
const [error, setError] = useState<string | null>(null);

const handleError = () => {
  setError('Failed to load video. Please try again.');
};

<video
  ref={videoRef}
  src={videoUrl}
  onError={handleError}
  // ... other props
/>

{error && (
  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
    <p className="text-white">{error}</p>
  </div>
)}
```

## Future Enhancements

### 1. Advanced Analysis Features
- Face detection using TensorFlow.js
- Object recognition
- Scene classification
- Watermark verification
- Content moderation

### 2. Player Features
- Playback speed control
- Picture-in-picture mode
- Subtitles/captions support
- Quality selection
- Thumbnail preview on seek

### 3. Analytics
- Track viewing duration
- Monitor analysis results
- Performance metrics
- User engagement data

## Troubleshooting

### Issue: Frame analysis not running
**Solution**: Ensure video is playing and `isPlaying` state is true.

### Issue: Poor performance
**Solution**: Reduce analysis frequency or use Web Workers.

### Issue: Canvas not capturing frames
**Solution**: Check CORS headers on video source.

### Issue: Overlay flickering
**Solution**: Add debouncing to analysis results.

## Summary

This implementation provides a robust video player with extensible frame analysis capability. The architecture separates concerns cleanly:

- **VideoPlayer**: UI and controls
- **useFrameAnalysis**: Frame capture and analysis logic
- **Analysis functions**: Pluggable analysis implementations

The system is designed for future extensibility while maintaining good performance and user experience.
