# Video Thumbnail Generation Implementation Guide

## Overview

This document provides a comprehensive guide for implementing browser-based video thumbnail generation that preserves aspect ratios for both portrait and landscape videos. The implementation uses HTML5 Canvas API to capture video frames and generate base64-encoded thumbnail images.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Implementation Architecture](#implementation-architecture)
3. [Step-by-Step Implementation](#step-by-step-implementation)
4. [Aspect Ratio Handling](#aspect-ratio-handling)
5. [Code Examples](#code-examples)
6. [Edge Cases and Error Handling](#edge-cases-and-error-handling)
7. [Best Practices](#best-practices)
8. [Integration Guide](#integration-guide)

## Core Concepts

### Key Requirements

1. **Aspect Ratio Preservation**: Thumbnails must maintain the original video's aspect ratio without stretching or distortion
2. **Orientation Detection**: The system must correctly identify portrait vs landscape videos
3. **Browser Compatibility**: Must work with various video formats (MP4, MOV, AVI, WEBM)
4. **Codec Compatibility**: Handle different video codecs, especially MOV files with keyframe issues
5. **Performance**: Generate thumbnails efficiently without blocking the UI

### Technical Approach

- Use HTML5 `<video>` element to load and decode video files
- Use HTML5 `<canvas>` element to capture and render video frames
- Convert canvas content to base64 data URL for storage/transmission
- Handle asynchronous operations with Promises
- Implement proper cleanup to prevent memory leaks

## Implementation Architecture

### Component Structure

```
generateVideoThumbnail(videoFile, options)
├── Create video element
├── Create canvas element
├── Load video metadata
├── Seek to target frame
├── Wait for frame decoding
├── Calculate canvas dimensions (preserving aspect ratio)
├── Draw video frame to canvas
└── Convert to base64 data URL
```

### Data Flow

1. **Input**: Video File object + Options (width, height, quality, seekTime)
2. **Processing**: Video loading → Metadata extraction → Frame seeking → Frame capture
3. **Output**: Base64-encoded JPEG data URL string

## Step-by-Step Implementation

### Step 1: Function Signature and Options

```typescript
interface ThumbnailOptions {
  width?: number;      // Maximum width (default: 240)
  height?: number;     // Maximum height (default: 135)
  quality?: number;    // JPEG quality 0-1 (default: 0.8)
  seekTime?: number;   // Time in seconds or percentage < 1 (default: 0.1)
}

function generateVideoThumbnail(
  videoFile: File,
  options: ThumbnailOptions = {}
): Promise<string>
```

**Key Points:**
- Returns a Promise that resolves to a base64 data URL string
- Options have sensible defaults for common use cases
- `seekTime` can be absolute (seconds) or relative (percentage < 1)

### Step 2: Initialize Video and Canvas Elements

```typescript
const video = document.createElement('video');
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

if (!ctx) {
  reject(new Error('Could not get canvas context'));
  return;
}
```

**Critical Configuration for Video Element:**

```typescript
video.preload = 'metadata';  // Load only metadata, not entire video
video.muted = true;          // Required for autoplay in some browsers
video.playsInline = true;    // Prevent fullscreen on mobile
```

**Why These Settings Matter:**
- `preload='metadata'`: Faster loading, only loads video dimensions and duration
- `muted=true`: Required for programmatic video playback in modern browsers
- `playsInline=true`: Prevents iOS Safari from entering fullscreen mode

### Step 3: Load Video File

```typescript
let objectUrl: string | null = null;

try {
  objectUrl = URL.createObjectURL(videoFile);
  video.src = objectUrl;
  video.load();
} catch (err) {
  reject(new Error('Failed to create video object URL'));
}
```

**Memory Management:**
- Always store `objectUrl` for cleanup
- Use `URL.createObjectURL()` to create a blob URL
- Call `URL.revokeObjectURL()` in cleanup to prevent memory leaks

### Step 4: Handle Metadata Loading

```typescript
video.onloadedmetadata = () => {
  try {
    // Calculate seek time
    let targetTime = seekTime < 1 
      ? video.duration * seekTime  // Percentage of duration
      : Math.min(seekTime, video.duration); // Absolute time in seconds
    
    // Ensure minimum seek time of 0.5 seconds for keyframe compatibility
    // MOV files and some MP4 files may not have keyframes at the very start
    targetTime = Math.max(0.5, Math.min(targetTime, video.duration - 0.1));

    video.currentTime = targetTime;
  } catch (err) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    reject(new Error('Failed to seek video'));
  }
};
```

**Key Considerations:**
- **Minimum Seek Time**: Use at least 0.5 seconds to avoid keyframe issues
- **Maximum Seek Time**: Don't exceed video duration minus a small buffer
- **Percentage vs Absolute**: Support both for flexibility

### Step 5: Wait for Frame Decoding

```typescript
video.onseeked = () => {
  // Add a small delay to ensure the frame is fully decoded
  // 100ms should be enough for most codecs, including MOV files
  setTimeout(captureFrame, 100);
};
```

**Why the Delay is Critical:**
- Some codecs (especially MOV) have frame decoding delays
- The `onseeked` event fires when seeking completes, but frame may not be fully decoded
- 100ms delay ensures the frame is ready for capture
- This is especially important for MOV files converted from other formats

### Step 6: Calculate Canvas Dimensions (Aspect Ratio Preservation)

This is the **most critical step** for preventing stretching:

```typescript
// Get video's actual dimensions
const videoWidth = video.videoWidth;
const videoHeight = video.videoHeight;

// Validate dimensions
if (videoWidth <= 0 || videoHeight <= 0) {
  reject(new Error('Video dimensions are invalid'));
  return;
}

// Determine orientation
const isPortrait = videoHeight > videoWidth;
const videoAspectRatio = videoWidth / videoHeight;

// Get max dimensions from options
const maxWidth = options.width || 240;
const maxHeight = options.height || 135;

let canvasWidth: number;
let canvasHeight: number;

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
```

**Aspect Ratio Logic Explained:**

1. **Orientation Detection**: `videoHeight > videoWidth` identifies portrait videos
2. **Portrait Handling**: 
   - Start by fitting to max height
   - Calculate width based on aspect ratio
   - If width exceeds max, switch to fitting by width
3. **Landscape Handling**:
   - Start by fitting to max width
   - Calculate height based on aspect ratio
   - If height exceeds max, switch to fitting by height
4. **Integer Dimensions**: Canvas dimensions must be integers
5. **Minimum Dimensions**: Ensure at least 1px to prevent errors

**Why This Works:**
- Always preserves the video's aspect ratio: `canvasWidth / canvasHeight = videoWidth / videoHeight`
- Fits within maximum bounds without exceeding them
- Handles both portrait and landscape correctly
- Prevents stretching by using actual video dimensions

### Step 7: Capture Frame to Canvas

```typescript
// Use requestAnimationFrame to ensure the frame is fully rendered
requestAnimationFrame(() => {
  try {
    // Draw the video frame to canvas at its natural aspect ratio
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
```

**Critical Details:**

1. **requestAnimationFrame**: Ensures the video frame is fully rendered before capture
2. **drawImage Parameters**:
   - Source: Full video frame (0, 0, videoWidth, videoHeight)
   - Destination: Scaled to calculated canvas dimensions (0, 0, canvasWidth, canvasHeight)
   - This scaling preserves aspect ratio automatically
3. **toDataURL**: Converts canvas to base64 JPEG string
4. **Cleanup**: Always revoke object URL to free memory

### Step 8: Error Handling

```typescript
// Handle video loading errors
video.onerror = (e) => {
  const error = video.error;
  const errorMsg = error 
    ? `Failed to load video file: ${error.message || `Error code ${error.code}`}`
    : 'Failed to load video file';
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  reject(new Error(errorMsg));
};

// Prevent multiple captures
let hasCaptured = false;

const captureFrame = () => {
  if (hasCaptured) return; // Prevent multiple captures
  hasCaptured = true;
  // ... capture logic
};
```

**Error Handling Best Practices:**
- Always clean up object URLs in error cases
- Provide meaningful error messages
- Prevent duplicate captures (important for async operations)
- Validate video dimensions before processing

## Aspect Ratio Handling

### The Problem

When generating thumbnails, there are two common mistakes:

1. **Fixed Aspect Ratio**: Using fixed dimensions (e.g., 240x135 for 16:9) forces all videos into the same aspect ratio, causing stretching
2. **Incorrect Scaling**: Not properly calculating dimensions based on video's actual aspect ratio

### The Solution

The implementation uses a **fit-within-bounds** approach:

1. **Detect Orientation**: Determine if video is portrait or landscape
2. **Calculate Dimensions**: Scale proportionally to fit within max bounds
3. **Preserve Ratio**: Ensure `canvasWidth / canvasHeight = videoWidth / videoHeight`

### Example Calculations

**Portrait Video (9:16, 1080x1920):**
- Max dimensions: 240x135
- Orientation: Portrait (height > width)
- Start: Fit to height (135px)
- Width: 135 × (1080/1920) = 75.94px
- Result: 76x135 (preserves 9:16 ratio)

**Landscape Video (16:9, 1920x1080):**
- Max dimensions: 240x135
- Orientation: Landscape (width > height)
- Start: Fit to width (240px)
- Height: 240 / (1920/1080) = 135px
- Result: 240x135 (preserves 16:9 ratio)

**Ultra-Wide Landscape (21:9, 2560x1080):**
- Max dimensions: 240x135
- Orientation: Landscape
- Start: Fit to width (240px)
- Height: 240 / (2560/1080) = 101.25px
- Result: 240x101 (fits within bounds, preserves ratio)

## Code Examples

### Complete Implementation

```typescript
export function generateVideoThumbnail(
  videoFile: File, 
  options: ThumbnailOptions = {}
): Promise<string> {
  const {
    width: maxWidth = 240,
    height: maxHeight = 135,
    quality = 0.8,
    seekTime = 0.1
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    // Configure video element
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let hasCaptured = false;
    let objectUrl: string | null = null;

    // Error handling
    video.onerror = (e) => {
      const error = video.error;
      const errorMsg = error 
        ? `Failed to load video file: ${error.message || `Error code ${error.code}`}`
        : 'Failed to load video file';
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error(errorMsg));
    };

    // Metadata loaded - seek to target time
    video.onloadedmetadata = () => {
      try {
        let targetTime = seekTime < 1 
          ? video.duration * seekTime
          : Math.min(seekTime, video.duration);
        
        targetTime = Math.max(0.5, Math.min(targetTime, video.duration - 0.1));
        video.currentTime = targetTime;
      } catch (err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to seek video'));
      }
    };

    // Frame capture function
    const captureFrame = () => {
      if (hasCaptured) return;
      hasCaptured = true;

      try {
        // Validate dimensions
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(new Error('Video dimensions are invalid'));
          return;
        }

        // Calculate canvas dimensions preserving aspect ratio
        const isPortrait = video.videoHeight > video.videoWidth;
        const videoAspectRatio = video.videoWidth / video.videoHeight;
        
        let canvasWidth: number;
        let canvasHeight: number;
        
        if (isPortrait) {
          canvasHeight = maxHeight;
          canvasWidth = maxHeight * videoAspectRatio;
          if (canvasWidth > maxWidth) {
            canvasWidth = maxWidth;
            canvasHeight = maxWidth / videoAspectRatio;
          }
        } else {
          canvasWidth = maxWidth;
          canvasHeight = maxWidth / videoAspectRatio;
          if (canvasHeight > maxHeight) {
            canvasHeight = maxHeight;
            canvasWidth = maxHeight * videoAspectRatio;
          }
        }
        
        canvasWidth = Math.round(Math.max(1, canvasWidth));
        canvasHeight = Math.round(Math.max(1, canvasHeight));
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Capture frame
        requestAnimationFrame(() => {
          try {
            ctx.drawImage(
              video,
              0, 0, video.videoWidth, video.videoHeight,
              0, 0, canvasWidth, canvasHeight
            );
            
            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', quality);
            
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            resolve(thumbnailDataUrl);
          } catch (err) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to generate thumbnail: ' + (err instanceof Error ? err.message : 'Unknown error')));
          }
        });
      } catch (err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to capture frame'));
      }
    };

    // Wait for frame to decode after seeking
    video.onseeked = () => {
      setTimeout(captureFrame, 100);
    };

    // Load video
    try {
      objectUrl = URL.createObjectURL(videoFile);
      video.src = objectUrl;
      video.load();
    } catch (err) {
      reject(new Error('Failed to create video object URL'));
    }
  });
}
```

### Usage Example

```typescript
// Basic usage
const thumbnail = await generateVideoThumbnail(videoFile);

// Custom dimensions and quality
const thumbnail = await generateVideoThumbnail(videoFile, {
  width: 480,
  height: 270,
  quality: 0.9,
  seekTime: 0.5 // 50% through video
});

// Use in upload flow
try {
  const thumbnail = await generateVideoThumbnail(file);
  // Store thumbnail as base64 string
  const videoData = {
    file: file,
    thumbnail: thumbnail
  };
} catch (error) {
  console.error('Thumbnail generation failed:', error);
  // Continue without thumbnail
}
```

## Edge Cases and Error Handling

### 1. Invalid Video Dimensions

```typescript
if (video.videoWidth <= 0 || video.videoHeight <= 0) {
  reject(new Error('Video dimensions are invalid'));
  return;
}
```

**When This Occurs:**
- Corrupted video files
- Videos that haven't fully loaded
- Unsupported codecs

**Solution:** Validate dimensions before processing

### 2. Keyframe Issues (MOV Files)

```typescript
// Ensure minimum seek time of 0.5 seconds
targetTime = Math.max(0.5, Math.min(targetTime, video.duration - 0.1));
```

**Why This Matters:**
- MOV files may not have keyframes at the very start
- Seeking to 0.0 seconds may fail or return a black frame
- 0.5 seconds ensures we're past initial keyframe issues

### 3. Frame Decoding Delays

```typescript
video.onseeked = () => {
  setTimeout(captureFrame, 100);
};
```

**Why the Delay:**
- Some codecs need time to fully decode the frame
- `onseeked` fires when seeking completes, not when frame is ready
- 100ms delay ensures frame is fully decoded

### 4. Multiple Capture Prevention

```typescript
let hasCaptured = false;

const captureFrame = () => {
  if (hasCaptured) return;
  hasCaptured = true;
  // ... capture logic
};
```

**Why This Matters:**
- Multiple events can trigger capture
- Prevents duplicate processing
- Ensures cleanup happens only once

### 5. Memory Leak Prevention

```typescript
let objectUrl: string | null = null;

// Always clean up
if (objectUrl) URL.revokeObjectURL(objectUrl);
```

**Critical:** Always revoke object URLs in:
- Success path
- Error handlers
- Finally blocks

## Best Practices

### 1. Always Use Metadata Preload

```typescript
video.preload = 'metadata';
```

**Benefits:**
- Faster loading (doesn't download entire video)
- Sufficient for thumbnail generation
- Reduces bandwidth usage

### 2. Handle Errors Gracefully

```typescript
try {
  const thumbnail = await generateVideoThumbnail(file);
  // Use thumbnail
} catch (error) {
  console.warn('Thumbnail generation failed:', error);
  // Continue without thumbnail - don't block user flow
}
```

**Best Practice:** Thumbnail generation should never block the main user flow

### 3. Set Appropriate Quality

```typescript
quality: 0.8  // Good balance between size and quality
```

**Guidelines:**
- 0.6-0.7: Smaller files, acceptable quality
- 0.8: Good balance (recommended)
- 0.9-1.0: Larger files, minimal quality gain

### 4. Use Appropriate Seek Time

```typescript
seekTime: 0.1  // 10% through video (avoids black frames)
```

**Guidelines:**
- 0.0-0.05: May hit keyframe issues
- 0.1-0.2: Good for avoiding intro/outro
- 0.5: Middle of video (safe choice)

### 5. Display Thumbnails Correctly

```html
<!-- Use object-contain to preserve aspect ratio -->
<img 
  src={thumbnailDataUrl} 
  className="object-contain w-full h-full"
  alt="Video thumbnail"
/>
```

**CSS Classes:**
- `object-contain`: Preserves aspect ratio, may show letterboxing
- `object-cover`: Fills container, may crop image
- For thumbnails, `object-contain` is usually preferred

## Integration Guide

### Step 1: Add the Function

Copy the `generateVideoThumbnail` function to your utilities file.

### Step 2: Create Type Definitions

```typescript
export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  seekTime?: number;
}
```

### Step 3: Integrate into Upload Flow

```typescript
async function handleVideoUpload(file: File) {
  try {
    // Generate thumbnail
    const thumbnail = await generateVideoThumbnail(file, {
      width: 240,
      height: 135,
      quality: 0.8
    });
    
    // Include thumbnail in upload data
    const uploadData = {
      file: file,
      thumbnail: thumbnail
    };
    
    // Upload to server
    await uploadVideo(uploadData);
  } catch (error) {
    console.error('Upload failed:', error);
  }
}
```

### Step 4: Store Thumbnails

**Option A: Base64 String (Client-Side)**
```typescript
// Store as base64 data URL
const videoData = {
  thumbnail: thumbnailDataUrl  // "data:image/jpeg;base64,..."
};
```

**Option B: Convert to Blob (Server Upload)**
```typescript
// Convert base64 to blob for server upload
const base64Response = await fetch(thumbnailDataUrl);
const blob = await base64Response.blob();
const formData = new FormData();
formData.append('thumbnail', blob, 'thumbnail.jpg');
```

### Step 5: Display Thumbnails

```tsx
// React component example
function VideoThumbnail({ thumbnailDataUrl }: { thumbnailDataUrl: string }) {
  return (
    <div className="w-60 aspect-video relative bg-gray-100 rounded-lg overflow-hidden">
      <img
        src={thumbnailDataUrl}
        alt="Video thumbnail"
        className="object-contain w-full h-full"
      />
    </div>
  );
}
```

## Testing Checklist

- [ ] Portrait videos generate correct aspect ratio thumbnails
- [ ] Landscape videos generate correct aspect ratio thumbnails
- [ ] Square videos generate correct aspect ratio thumbnails
- [ ] Ultra-wide videos fit within bounds
- [ ] MOV files work correctly (keyframe handling)
- [ ] MP4 files work correctly
- [ ] Error handling works for corrupted files
- [ ] Memory cleanup prevents leaks
- [ ] Thumbnails display without stretching
- [ ] Multiple videos can be processed simultaneously

## Common Pitfalls to Avoid

1. **Don't use fixed aspect ratios** - Always calculate based on video dimensions
2. **Don't skip the frame decoding delay** - Especially important for MOV files
3. **Don't forget to revoke object URLs** - Causes memory leaks
4. **Don't use seekTime = 0** - May hit keyframe issues
5. **Don't use object-cover for display** - Causes stretching, use object-contain
6. **Don't skip dimension validation** - Prevents errors with corrupted files
7. **Don't capture multiple times** - Use hasCaptured flag

## Summary

The key to successful thumbnail generation is:

1. **Preserve Aspect Ratio**: Always calculate dimensions based on video's actual aspect ratio
2. **Handle Orientation**: Detect portrait vs landscape and adjust calculations accordingly
3. **Codec Compatibility**: Add delays and minimum seek times for problematic codecs
4. **Error Handling**: Gracefully handle failures without blocking user flow
5. **Memory Management**: Always clean up object URLs and prevent leaks
6. **Display Correctly**: Use `object-contain` CSS to preserve aspect ratio in UI

This implementation ensures thumbnails are generated correctly for all video orientations and formats while maintaining high quality and performance.
