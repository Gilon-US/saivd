# Video Player Implementation Guide
## User ID Extraction and QR Code Overlay

**Version:** 1.0  
**Last Updated:** January 2025  
**Purpose:** This document provides comprehensive implementation details for video playback with real-time user ID extraction from watermarked videos and QR code overlay display. This guide is intended for LLM-assisted development of a matching player implementation in a separate application.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Component Architecture](#component-architecture)
4. [Frame Analysis Hook (`useFrameAnalysis`)](#frame-analysis-hook-useframeanalysis)
5. [Video Player Component](#video-player-component)
6. [User ID Extraction API](#user-id-extraction-api)
7. [QR Code Display Logic](#qr-code-display-logic)
8. [State Management and Lifecycle](#state-management-and-lifecycle)
9. [API Endpoints Reference](#api-endpoints-reference)
10. [Implementation Flow](#implementation-flow)
11. [Edge Cases and Error Handling](#edge-cases-and-error-handling)
12. [Performance Considerations](#performance-considerations)
13. [Code Examples](#code-examples)

---

## Executive Summary

The video player implementation provides real-time extraction of creator user IDs from watermarked videos during playback. The system:

- **Extracts user ID** from video frames every 20 frames using an external watermark service
- **Displays QR code** overlay in the top-left corner of the video player once user ID is extracted
- **Persists extracted user ID** across video pause/play/end cycles
- **Restores QR code** immediately on replay without requiring re-extraction
- **Handles edge cases** such as video end, replay, seeking, and errors gracefully

### Key Features

- Real-time frame analysis during video playback
- Asynchronous user ID extraction (non-blocking)
- QR code overlay positioned at top-left (16x16 rem, 64px × 64px)
- State persistence across video lifecycle events
- Automatic restoration on replay

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────┐
│  VideoGrid      │  User clicks "Play Watermarked Video"
│  (Container)    │─────────────────────────────────────┐
└─────────────────┘                                     │
                                                         ▼
                                        ┌────────────────────────────┐
                                        │ GET /api/videos/[id]/play  │
                                        │ ?variant=watermarked       │
                                        └────────────────────────────┘
                                                         │
                                                         ▼
                                        ┌────────────────────────────┐
                                        │ Returns presigned URL      │
                                        │ for watermarked video      │
                                        └────────────────────────────┘
                                                         │
                                                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          VideoPlayer Component                        │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  <video> element with controls                              │     │
│  └────────────────────────────────────────────────────────────┘     │
│                          │                                           │
│                          ▼                                           │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  useFrameAnalysis Hook                                      │     │
│  │  • Frame analysis loop (requestAnimationFrame)              │     │
│  │  • Counts frames                                            │     │
│  │  • Every 20 frames:                                         │     │
│  │    └─> GET /api/videos/[id]/extract-user-id?frame_index=N  │     │
│  └────────────────────────────────────────────────────────────┘     │
│                          │                                           │
│                          ▼                                           │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  External Watermark Service                                 │     │
│  │  POST /extract_user_id                                     │     │
│  │  Returns: { success: true, user_id: "30129560" }          │     │
│  └────────────────────────────────────────────────────────────┘     │
│                          │                                           │
│                          ▼                                           │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  QR Code URL Construction                                  │     │
│  │  /profile/{user_id}/qr                                     │     │
│  └────────────────────────────────────────────────────────────┘     │
│                          │                                           │
│                          ▼                                           │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  <img src="/profile/30129560/qr" />                        │     │
│  │  Positioned: absolute top-2 left-2                         │     │
│  │  Size: w-16 h-16 (64px × 64px)                            │     │
│  └────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
VideoGrid (Container)
  └── VideoPlayer
        ├── <video> element
        ├── Custom controls (play, pause, seek, volume, fullscreen)
        └── useFrameAnalysis Hook
              ├── Canvas for frame capture
              ├── Frame analysis loop
              ├── User ID extraction logic
              └── QR URL state management
```

---

## Component Architecture

### 1. VideoGrid (Container Component)

**Purpose:** Manages video list and opens player for selected videos.

**Key Responsibilities:**
- Renders video thumbnails in a grid
- Handles "Play Watermarked" button clicks
- Opens VideoPlayer with appropriate props
- Manages videoPlayer state: `{ isOpen, videoUrl, videoId, enableFrameAnalysis }`

**Critical Props Passed to VideoPlayer:**
```typescript
{
  videoUrl: string;           // Presigned playback URL
  videoId: string;            // Video database ID
  enableFrameAnalysis: true;  // Only true for watermarked variant
  isOpen: boolean;            // Controls player visibility
  onClose: () => void;        // Closes player and resets state
}
```

**Opening Watermarked Video:**
```typescript
// When user clicks "Play Watermarked"
const response = await fetch(`/api/videos/${video.id}/play?variant=watermarked`);
const data = await response.json();

setVideoPlayer({
  isOpen: true,
  videoUrl: data.data.playbackUrl,  // Presigned S3 URL
  videoId: video.id,
  enableFrameAnalysis: true  // Enable frame analysis for watermarked videos
});
```

---

### 2. VideoPlayer Component

**Purpose:** Main video player UI with custom controls and QR overlay.

**Key Features:**
- Custom video controls (play/pause, seek, volume, fullscreen)
- QR code overlay in top-left corner
- Manages video playback state (`isPlaying`)
- Handles video lifecycle events (ended, loaded, time updates)
- Integrates with `useFrameAnalysis` hook

**Props Interface:**
```typescript
interface VideoPlayerProps {
  videoUrl: string;              // Video source URL (presigned)
  videoId?: string | null;       // Video ID for user ID extraction
  onClose: () => void;           // Callback to close player
  isOpen: boolean;               // Controls visibility
  enableFrameAnalysis: boolean;  // Enable/disable frame analysis
}
```

**Key Implementation Details:**

1. **Video Element:**
   - Uses HTML5 `<video>` element
   - Handles `onTimeUpdate`, `onLoadedMetadata`, `onEnded` events
   - When video ends: `setIsPlaying(false)` is called

2. **Playback Controls:**
   - Play/Pause toggle
   - Seek bar (range input)
   - Volume control
   - Fullscreen toggle
   - Time display (current/duration)

3. **Replay Handling:**
   ```typescript
   const togglePlay = () => {
     if (videoRef.current) {
       if (isPlaying) {
         videoRef.current.pause();
       } else {
         // If video has ended, seek to start before playing
         if (videoRef.current.currentTime >= videoRef.current.duration) {
           videoRef.current.currentTime = 0;
         }
         videoRef.current.play();
       }
       setIsPlaying(!isPlaying);
     }
   };
   ```

4. **QR Code Overlay:**
   - Conditionally rendered when `qrUrl` is not null
   - Positioned absolutely at top-left (top-2, left-2 in Tailwind)
   - Size: 16×16 rem (64px × 64px)
   - Styled with rounded corners and shadow
   - Uses `pointer-events-none` to avoid blocking video interactions

---

## Frame Analysis Hook (`useFrameAnalysis`)

**Purpose:** Core logic for frame extraction, user ID extraction, and QR code URL management.

**Hook Signature:**
```typescript
function useFrameAnalysis(
  videoRef: RefObject<HTMLVideoElement | null>,
  isPlaying: boolean,
  analysisFunction: FrameAnalysisFunction,
  videoId?: string
): { qrUrl: string | null; showOverlay: boolean }
```

### Internal State

```typescript
// React State
const [qrUrl, setQrUrl] = useState<string | null>(null);
const [extractedUserId, setExtractedUserId] = useState<string | null>(null);

// React Refs (persist across renders, don't trigger re-renders)
const canvasRef = useRef<HTMLCanvasElement | null>(null);
const contextRef = useRef<CanvasRenderingContext2D | null>(null);
const animationFrameRef = useRef<number | null>(null);
const skipPixelReadRef = useRef<boolean>(false);
const frameCountRef = useRef<number>(0);
const lastExtractionFrameRef = useRef<number>(-1);
const isExtractingRef = useRef<boolean>(false);
```

### Frame Analysis Loop

**Activation:** Starts when `isPlaying === true` and `videoId` is provided.

**Process:**
1. Uses `requestAnimationFrame` for smooth frame analysis
2. Draws current video frame to canvas
3. Extracts image data (handles CORS/tainted canvas errors)
4. Counts frames using `frameCountRef.current`
5. Every 20 frames: calls user ID extraction API
6. Continues until video is paused/ended

**Key Code Structure:**
```typescript
const analyzeFrame = () => {
  const video = videoRef.current;
  const canvas = canvasRef.current;
  const context = contextRef.current;

  // Early exit if video not ready
  if (!video || !canvas || !context || video.paused || video.ended) {
    return;
  }

  // Handle tainted canvas (CORS issues)
  if (skipPixelReadRef.current) {
    imageData = new ImageData(1, 1);
  } else {
    try {
      // Resize canvas to match video dimensions
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      
      // Draw current frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Extract pixel data
      imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") {
        skipPixelReadRef.current = true;  // Skip pixel reads on subsequent frames
        imageData = new ImageData(1, 1);
      }
    }
  }

  // User ID extraction logic (only if videoId provided)
  if (videoId && !isExtractingRef.current) {
    frameCountRef.current += 1;
    
    // Extract every 20 frames
    if (frameCountRef.current - lastExtractionFrameRef.current >= 20) {
      const frameIndex = frameCountRef.current;
      isExtractingRef.current = true;
      lastExtractionFrameRef.current = frameCountRef.current;
      
      // Fire-and-forget API call (non-blocking)
      fetch(`/api/videos/${videoId}/extract-user-id?frame_index=${frameIndex}`)
        .then(async (response) => {
          if (!response.ok) return;
          const data = await response.json();
          if (data.success && data.data?.user_id) {
            setExtractedUserId(data.data.user_id);
          }
        })
        .catch((error) => console.error("Error extracting user ID:", error))
        .finally(() => {
          isExtractingRef.current = false;
        });
    }
  }

  // Schedule next frame analysis
  if (isPlaying) {
    animationFrameRef.current = requestAnimationFrame(analyzeFrame);
  }
};

// Start loop when playing
if (isPlaying) {
  animationFrameRef.current = requestAnimationFrame(analyzeFrame);
}

// Cleanup on unmount or when isPlaying changes
return () => {
  if (animationFrameRef.current !== null) {
    cancelAnimationFrame(animationFrameRef.current);
  }
};
```

### User ID Extraction Frequency

- **Interval:** Every 20 frames
- **Frame Index:** Uses actual frame count (1, 21, 41, 61, ...)
- **Prevention:** `isExtractingRef` prevents concurrent extraction requests
- **Non-blocking:** Uses fire-and-forget fetch (no await)

### State Management Effects

#### Effect 1: Frame Counter Reset on Playback Stop
```typescript
useEffect(() => {
  if (!isPlaying) {
    // Reset frame counters, but preserve extractedUserId and qrUrl
    frameCountRef.current = 0;
    lastExtractionFrameRef.current = -1;
    isExtractingRef.current = false;
  } else {
    // When video starts playing, restore QR URL if we have extractedUserId
    if (videoId && extractedUserId && !qrUrl) {
      const qrUrlFromUserId = `/profile/${extractedUserId}/qr`;
      setQrUrl((currentQrUrl) => {
        if (currentQrUrl !== qrUrlFromUserId) {
          return qrUrlFromUserId;
        }
        return currentQrUrl;
      });
    }
  }
}, [isPlaying, videoId, extractedUserId, qrUrl]);
```

**Key Behavior:**
- **On stop:** Resets frame counters only (does NOT clear `extractedUserId` or `qrUrl`)
- **On play:** Restores QR URL immediately if `extractedUserId` exists
- **Purpose:** Ensures QR code persists across pause/play/end cycles

#### Effect 2: Reset on Video ID Change
```typescript
useEffect(() => {
  // When videoId changes, reset everything
  setExtractedUserId(null);
  setQrUrl(null);
  frameCountRef.current = 0;
  lastExtractionFrameRef.current = -1;
  isExtractingRef.current = false;
}, [videoId]);
```

**Key Behavior:**
- **Triggers:** When `videoId` prop changes
- **Action:** Clears all extraction state
- **Purpose:** Fresh state when switching videos

#### Effect 3: Update QR URL When User ID Extracted
```typescript
useEffect(() => {
  if (videoId && extractedUserId) {
    const qrUrlFromUserId = `/profile/${extractedUserId}/qr`;
    setQrUrl(qrUrlFromUserId);
  } else if (!videoId) {
    setQrUrl(null);
  }
}, [videoId, extractedUserId, isPlaying]);
```

**Key Behavior:**
- **Triggers:** When `extractedUserId` changes, `videoId` changes, or `isPlaying` changes
- **Action:** Sets QR URL to `/profile/{user_id}/qr`
- **Purpose:** Keeps QR URL in sync with extracted user ID

### Return Value

```typescript
return {
  qrUrl: string | null,           // QR code image URL (or null)
  showOverlay: qrUrl !== null     // Boolean convenience flag
};
```

---

## User ID Extraction API

### Frontend API Endpoint

**Endpoint:** `GET /api/videos/[id]/extract-user-id`

**Query Parameters:**
- `frame_index` (optional, default: 0): Frame number to analyze

**Request Example:**
```
GET /api/videos/abc123/extract-user-id?frame_index=120
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "user_id": "30129560",
    "frame_index": 120,
    "video_name": "videos/user-id/timestamp-uuid-watermarked.mp4"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "extraction_failed",
    "message": "Failed to extract user ID from video frame"
  }
}
```

### Backend Implementation

**Location:** `src/app/api/videos/[id]/extract-user-id/route.ts`

**Process:**
1. Validates video ID and authentication
2. Loads video from database
3. Verifies video has `processed_url` (watermarked version)
4. Extracts S3 key from `processed_url` (handles both URL and key formats)
5. Calls external watermark service
6. Returns extracted user ID

**Backend → External Service Request:**
```typescript
POST {WATERMARK_SERVICE_URL}/extract_user_id
Content-Type: application/json

{
  "video_name": "videos/{userId}/{timestamp}-{uuid}-watermarked.mp4",
  "frame_index": 120,
  "bucket": "saivd-app"
}
```

**External Service Response:**
```json
{
  "success": true,
  "user_id": "30129560",
  "frame_index": 120,
  "video_name": "videos/..."
}
```

**Important Notes:**
- `video_name` must include full S3 key path with file extension
- `bucket` is required as separate property
- Response structure is flat (not nested under `data`)
- Frame index is 0-based in API but uses frame count (1, 21, 41...) in practice

---

## QR Code Display Logic

### QR Code URL Format

```
/profile/{numeric_user_id}/qr
```

**Example:**
- User ID: `30129560`
- QR URL: `/profile/30129560/qr`

### QR Code Endpoint

**Endpoint:** `GET /profile/[userId]/qr`

**Response:**
- Content-Type: `image/png`
- Body: PNG image buffer
- Cache-Control: `public, max-age=60`

**Backend Process:**
1. Validates numeric user ID
2. Looks up profile by `numeric_user_id`
3. Generates/ensures QR code exists in Wasabi storage
4. Retrieves QR code PNG from Wasabi
5. Returns image buffer with appropriate headers

### QR Code Overlay Rendering

**Location in VideoPlayer:**
```tsx
{qrUrl && (
  <div className="absolute top-2 left-2 pointer-events-none">
    <img 
      src={qrUrl} 
      alt="Creator QR code" 
      className="w-16 h-16 object-contain rounded-md shadow-md" 
    />
  </div>
)}
```

**Styling:**
- Position: Absolute, top-left corner (8px from top, 8px from left)
- Size: 64px × 64px (w-16 h-16 in Tailwind)
- Object-fit: Contain (preserves aspect ratio)
- Border-radius: Rounded corners (rounded-md)
- Shadow: Drop shadow for visibility
- Pointer events: None (doesn't block video interactions)

**Visibility:**
- Shown when `qrUrl !== null`
- Hidden when `qrUrl === null`
- Updates automatically when user ID is extracted

---

## State Management and Lifecycle

### State Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Video Opens (videoId provided, enableFrameAnalysis=true)   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Initial State:                                             │
│  • extractedUserId: null                                    │
│  • qrUrl: null                                              │
│  • frameCountRef: 0                                         │
│  • lastExtractionFrameRef: -1                               │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  User Clicks Play → isPlaying = true                        │
│  • Frame analysis loop starts                               │
│  • Frame counter increments                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Frame 20: Extract User ID                                  │
│  • API call: /api/videos/[id]/extract-user-id?frame_index=20│
│  • Response: { user_id: "30129560" }                        │
│  • extractedUserId = "30129560"                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Effect Triggers: extractedUserId changed                   │
│  • qrUrl = "/profile/30129560/qr"                           │
│  • QR code overlay appears                                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Video Continues Playing                                    │
│  • Frame 40, 60, 80... (extraction every 20 frames)        │
│  • QR code remains visible                                  │
│  • extractedUserId persists                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Video Pauses or Ends                                       │
│  • isPlaying = false                                        │
│  • Frame analysis loop stops                                │
│  • Frame counters reset                                     │
│  • extractedUserId: KEPT (not cleared)                      │
│  • qrUrl: KEPT (not cleared)                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  User Clicks Play Again                                     │
│  • isPlaying = true                                         │
│  • Effect detects extractedUserId exists                    │
│  • qrUrl restored immediately                               │
│  • QR code appears without waiting for extraction           │
│  • Frame analysis loop restarts                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Video Closes or Switches                                   │
│  • videoId changes or isOpen = false                        │
│  • Everything resets:                                       │
│    - extractedUserId = null                                 │
│    - qrUrl = null                                           │
│    - Frame counters = 0                                     │
└─────────────────────────────────────────────────────────────┘
```

### State Persistence Rules

| Event | extractedUserId | qrUrl | frameCountRef | Action |
|-------|----------------|-------|---------------|--------|
| Video opens | null | null | 0 | Initial state |
| Play starts | null | null | 0 → 1, 2, 3... | Count frames |
| Frame 20 extraction succeeds | "30129560" | null → "/profile/30129560/qr" | 20 | Set user ID, show QR |
| Video pauses | "30129560" (kept) | "/profile/30129560/qr" (kept) | Reset to 0 | Preserve state |
| Play resumes | "30129560" (kept) | "/profile/30129560/qr" (restored) | 0 → 1, 2... | Restore QR immediately |
| Video ends | "30129560" (kept) | "/profile/30129560/qr" (kept) | Reset to 0 | Preserve state |
| Replay after end | "30129560" (kept) | "/profile/30129560/qr" (restored) | 0 → 1, 2... | Restore QR immediately |
| Video closes | null | null | 0 | Full reset |
| Video switches | null | null | 0 | Full reset |

### Key Design Decisions

1. **Preserve extractedUserId on pause/end:** Once extracted, user ID persists until video is closed or switched. This prevents unnecessary re-extraction.

2. **Restore QR URL on play:** When video resumes, QR URL is immediately restored if `extractedUserId` exists. This ensures QR code appears instantly without waiting for frame extraction.

3. **Reset on videoId change:** Switching to a different video clears all state to prevent showing wrong QR code.

4. **Frame counter resets:** Frame counters reset on stop but extracted state persists. This allows fresh extraction attempts if needed while preserving successful results.

---

## API Endpoints Reference

### 1. Get Playback URL

**Endpoint:** `GET /api/videos/[id]/play`

**Query Parameters:**
- `variant` (required): `"original"` or `"watermarked"`

**Response:**
```json
{
  "success": true,
  "data": {
    "playbackUrl": "https://s3.wasabisys.com/bucket/key?..."
  }
}
```

**Usage:**
- Called when opening video for playback
- Returns presigned S3 URL valid for limited time
- Use `variant=watermarked` for frame analysis

---

### 2. Extract User ID from Frame

**Endpoint:** `GET /api/videos/[id]/extract-user-id`

**Query Parameters:**
- `frame_index` (optional): Frame number (default: 0)

**Authentication:** Required (user must own video)

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "30129560",
    "frame_index": 120,
    "video_name": "videos/.../video-watermarked.mp4"
  }
}
```

**Error Responses:**
- `400`: Missing video ID, invalid frame_index, missing watermarked video
- `401`: Authentication required
- `404`: Video not found or not owned by user
- `502`: External watermark service error

**Usage:**
- Called every 20 frames during playback
- Non-blocking (fire-and-forget)
- Only works for videos with `processed_url` (watermarked)

---

### 3. Get QR Code Image

**Endpoint:** `GET /profile/[userId]/qr`

**Path Parameters:**
- `userId`: Numeric user ID (e.g., "30129560")

**Response:**
- Content-Type: `image/png`
- Body: PNG image buffer
- Cache-Control: `public, max-age=60`

**Usage:**
- Used as `src` for QR code overlay image
- Public endpoint (no authentication required)
- Automatically generates QR code if it doesn't exist

---

## Implementation Flow

### Complete Flow: Opening Watermarked Video

```
1. User clicks "Play Watermarked" button
   │
   ▼
2. VideoGrid calls: GET /api/videos/{id}/play?variant=watermarked
   │
   ▼
3. Backend returns presigned playback URL
   │
   ▼
4. VideoGrid opens VideoPlayer with:
   - videoUrl: presigned URL
   - videoId: video database ID
   - enableFrameAnalysis: true
   │
   ▼
5. VideoPlayer renders <video> element
   │
   ▼
6. useFrameAnalysis hook initializes:
   - extractedUserId: null
   - qrUrl: null
   - frameCountRef: 0
   │
   ▼
7. User clicks Play button
   │
   ▼
8. isPlaying = true
   │
   ▼
9. Frame analysis loop starts (requestAnimationFrame)
   │
   ▼
10. Every frame:
    - Draw frame to canvas
    - Increment frameCountRef
    - Check if frameCountRef - lastExtractionFrameRef >= 20
    │
    ▼
11. Frame 20: Extract user ID
    - API: GET /api/videos/{id}/extract-user-id?frame_index=20
    - Backend calls external watermark service
    │
    ▼
12. External service returns: { success: true, user_id: "30129560" }
    │
    ▼
13. Frontend receives response:
    - extractedUserId = "30129560"
    │
    ▼
14. Effect triggers (extractedUserId changed):
    - qrUrl = "/profile/30129560/qr"
    │
    ▼
15. QR code overlay appears in top-left corner
    │
    ▼
16. Video continues playing
    - Frame 40, 60, 80... (extraction every 20 frames)
    - QR code remains visible
    - extractedUserId persists
```

### Flow: Video Replay After End

```
1. Video ends → onEnded event fires
   │
   ▼
2. setIsPlaying(false)
   │
   ▼
3. Frame analysis loop stops
   │
   ▼
4. Effect triggers (isPlaying changed):
   - frameCountRef = 0 (reset)
   - lastExtractionFrameRef = -1 (reset)
   - extractedUserId: KEPT (not cleared)
   - qrUrl: KEPT (not cleared)
   │
   ▼
5. QR code overlay remains visible (because qrUrl still set)
   │
   ▼
6. User clicks Play button again
   │
   ▼
7. togglePlay() checks:
   - currentTime >= duration → seek to 0
   │
   ▼
8. setIsPlaying(true)
   │
   ▼
9. Effect triggers (isPlaying changed to true):
   - Detects extractedUserId exists
   - Restores qrUrl immediately (functional update)
   │
   ▼
10. Frame analysis loop starts
    │
    ▼
11. QR code overlay appears immediately (no waiting for extraction)
    │
    ▼
12. Frame analysis continues normally
```

---

## Edge Cases and Error Handling

### 1. CORS / Tainted Canvas

**Scenario:** Video source from different origin without proper CORS headers.

**Detection:**
```typescript
try {
  imageData = context.getImageData(0, 0, canvas.width, canvas.height);
} catch (error) {
  if (error instanceof DOMException && error.name === "SecurityError") {
    skipPixelReadRef.current = true;
    imageData = new ImageData(1, 1);
  }
}
```

**Handling:**
- Set `skipPixelReadRef = true` to avoid repeated errors
- Use dummy `ImageData(1, 1)` for subsequent frames
- Frame analysis continues (but pixel data unavailable)
- User ID extraction still works (uses external service, not pixel data)

---

### 2. Video Not Watermarked

**Scenario:** User opens original video (not watermarked).

**Handling:**
- `enableFrameAnalysis = false` for original videos
- `useFrameAnalysis` receives `videoId = undefined`
- Frame analysis loop runs but skips user ID extraction
- No QR code displayed

---

### 3. Extraction API Fails

**Scenario:** `/api/videos/[id]/extract-user-id` returns error or times out.

**Handling:**
```typescript
fetch(`/api/videos/${videoId}/extract-user-id?frame_index=${frameIndex}`)
  .then(async (response) => {
    if (!response.ok) {
      console.warn("[FrameAnalysis] Failed to extract user ID", response.status);
      return;  // Silent failure, continue trying
    }
    // ... process response
  })
  .catch((error) => {
    console.error("[FrameAnalysis] Error extracting user ID:", error);
    // Silent failure, extraction will retry on next interval
  })
  .finally(() => {
    isExtractingRef.current = false;  // Allow next extraction attempt
  });
```

**Behavior:**
- Silent failure (logs to console)
- `isExtractingRef` reset to allow retry
- Next extraction attempt in 20 frames
- QR code remains hidden until successful extraction

---

### 4. Video Ends Before Extraction

**Scenario:** Video ends before frame 20 (or before first successful extraction).

**Handling:**
- Frame analysis loop stops when video ends
- `extractedUserId` remains null
- QR code not displayed (correct behavior)
- If video is replayed, extraction continues from frame 0

---

### 5. Concurrent Extraction Requests

**Scenario:** Multiple extraction requests triggered simultaneously.

**Prevention:**
```typescript
if (videoId && !isExtractingRef.current) {
  // Only proceed if not already extracting
  isExtractingRef.current = true;
  // ... make API call
  .finally(() => {
    isExtractingRef.current = false;
  });
}
```

**Behavior:**
- `isExtractingRef` flag prevents concurrent requests
- Only one extraction request active at a time
- Next extraction waits until current completes

---

### 6. Video Seeks While Playing

**Scenario:** User seeks to different position during playback.

**Current Behavior:**
- Frame counter continues incrementing (doesn't reset)
- Extraction continues based on frame count (not video time)
- May result in extraction from different video position than expected
- QR code persists if already extracted

**Note:** This is acceptable because:
- User ID should be consistent across frames in watermarked video
- Multiple extraction attempts increase success probability
- Frame counter is not tied to video time for simplicity

---

### 7. Video Switches Without Closing Player

**Scenario:** User opens different video while player is open.

**Handling:**
```typescript
useEffect(() => {
  // When videoId changes, reset everything
  setExtractedUserId(null);
  setQrUrl(null);
  frameCountRef.current = 0;
  lastExtractionFrameRef.current = -1;
  isExtractingRef.current = false;
}, [videoId]);
```

**Behavior:**
- All state reset when `videoId` changes
- Fresh extraction for new video
- Prevents showing wrong QR code

---

### 8. Component Unmounts During Extraction

**Scenario:** User closes player while extraction API call is in flight.

**Handling:**
- React cleanup function cancels `requestAnimationFrame`
- API call completes but state updates are ignored (component unmounted)
- No memory leaks or errors

---

## Performance Considerations

### Frame Analysis Performance

**Optimizations:**
1. **Canvas reuse:** Canvas element created once, reused across frames
2. **Context reuse:** Rendering context cached in ref
3. **Skip pixel reads:** After CORS error, skips expensive `getImageData` calls
4. **Non-blocking extraction:** API calls are fire-and-forget (no await)
5. **Frame throttling:** Extraction only every 20 frames (not every frame)

**Performance Impact:**
- Frame analysis runs at display refresh rate (typically 60fps)
- Canvas operations are GPU-accelerated
- User ID extraction API calls are asynchronous and non-blocking
- Minimal impact on video playback performance

### Memory Management

**Refs vs State:**
- Frame counters stored in refs (don't trigger re-renders)
- Only `extractedUserId` and `qrUrl` in state (minimal re-renders)
- Canvas/context stored in refs (persistent but not reactive)

**Cleanup:**
- `requestAnimationFrame` properly cancelled on unmount
- No memory leaks from event listeners or timers

### Network Optimization

**API Call Frequency:**
- User ID extraction: Every 20 frames
- At 30fps: ~1.5 requests/second maximum
- At 60fps: ~3 requests/second maximum
- Acceptable rate for API load

**QR Code Caching:**
- QR code endpoint returns `Cache-Control: public, max-age=60`
- Browser caches QR image for 60 seconds
- Reduces redundant requests when QR URL doesn't change

---

## Code Examples

### Example 1: Complete VideoPlayer Component Structure

```typescript
interface VideoPlayerProps {
  videoUrl: string;
  videoId?: string | null;
  onClose: () => void;
  isOpen: boolean;
  enableFrameAnalysis: boolean;
}

export function VideoPlayer({
  videoUrl,
  videoId,
  onClose,
  isOpen,
  enableFrameAnalysis
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Frame analysis hook
  const analysisFunction = useCallback(() => null, [enableFrameAnalysis]);
  const {qrUrl} = useFrameAnalysis(
    videoRef,
    isPlaying,
    analysisFunction,
    enableFrameAnalysis && videoId ? videoId : undefined
  );
  
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // Seek to start if video ended
        if (videoRef.current.currentTime >= videoRef.current.duration) {
          videoRef.current.currentTime = 0;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      <div className="relative w-full max-w-5xl">
        <video
          ref={videoRef}
          src={videoUrl}
          onEnded={() => setIsPlaying(false)}
        />
        
        {/* QR Code Overlay */}
        {qrUrl && (
          <div className="absolute top-2 left-2 pointer-events-none">
            <img 
              src={qrUrl} 
              alt="Creator QR code" 
              className="w-16 h-16 object-contain rounded-md shadow-md" 
            />
          </div>
        )}
        
        {/* Controls */}
        <button onClick={togglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>
      </div>
    </div>
  );
}
```

### Example 2: Frame Analysis Hook Skeleton

```typescript
export function useFrameAnalysis(
  videoRef: RefObject<HTMLVideoElement | null>,
  isPlaying: boolean,
  analysisFunction: FrameAnalysisFunction,
  videoId?: string
) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [extractedUserId, setExtractedUserId] = useState<string | null>(null);
  const frameCountRef = useRef(0);
  const lastExtractionFrameRef = useRef(-1);
  const isExtractingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Main frame analysis loop
  useEffect(() => {
    const analyzeFrame = () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) return;
      
      // Extract user ID every 20 frames
      if (videoId && !isExtractingRef.current) {
        frameCountRef.current += 1;
        if (frameCountRef.current - lastExtractionFrameRef.current >= 20) {
          const frameIndex = frameCountRef.current;
          isExtractingRef.current = true;
          lastExtractionFrameRef.current = frameCountRef.current;
          
          fetch(`/api/videos/${videoId}/extract-user-id?frame_index=${frameIndex}`)
            .then(async (response) => {
              if (!response.ok) return;
              const data = await response.json();
              if (data.success && data.data?.user_id) {
                setExtractedUserId(data.data.user_id);
              }
            })
            .catch(console.error)
            .finally(() => {
              isExtractingRef.current = false;
            });
        }
      }
      
      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(analyzeFrame);
      }
    };
    
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(analyzeFrame);
    }
    
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [videoRef, isPlaying, videoId]);
  
  // Restore QR URL on replay
  useEffect(() => {
    if (!isPlaying) {
      frameCountRef.current = 0;
      lastExtractionFrameRef.current = -1;
      isExtractingRef.current = false;
    } else {
      if (videoId && extractedUserId && !qrUrl) {
        setQrUrl(`/profile/${extractedUserId}/qr`);
      }
    }
  }, [isPlaying, videoId, extractedUserId, qrUrl]);
  
  // Reset on video change
  useEffect(() => {
    setExtractedUserId(null);
    setQrUrl(null);
    frameCountRef.current = 0;
    lastExtractionFrameRef.current = -1;
    isExtractingRef.current = false;
  }, [videoId]);
  
  // Update QR URL when user ID extracted
  useEffect(() => {
    if (videoId && extractedUserId) {
      setQrUrl(`/profile/${extractedUserId}/qr`);
    } else if (!videoId) {
      setQrUrl(null);
    }
  }, [videoId, extractedUserId, isPlaying]);
  
  return {qrUrl, showOverlay: qrUrl !== null};
}
```

### Example 3: Opening Watermarked Video

```typescript
const handlePlayWatermarked = async (video: Video) => {
  try {
    // Get presigned playback URL
    const response = await fetch(
      `/api/videos/${video.id}/play?variant=watermarked`
    );
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || "Failed to get playback URL");
    }
    
    // Open player with frame analysis enabled
    setVideoPlayer({
      isOpen: true,
      videoUrl: data.data.playbackUrl,
      videoId: video.id,
      enableFrameAnalysis: true  // Enable for watermarked videos
    });
  } catch (error) {
    console.error("Error opening video:", error);
    // Show error to user
  }
};
```

---

## Summary of Key Implementation Points

### Must-Have Features

1. **Frame Analysis Loop:**
   - Uses `requestAnimationFrame` for smooth analysis
   - Counts frames continuously during playback
   - Extracts user ID every 20 frames

2. **State Persistence:**
   - `extractedUserId` persists across pause/play/end
   - QR URL restored immediately on replay
   - State resets only when video changes or player closes

3. **QR Code Overlay:**
   - Positioned absolutely at top-left (8px from edges)
   - Size: 64px × 64px
   - URL format: `/profile/{numeric_user_id}/qr`
   - Only visible when `qrUrl !== null`

4. **Non-Blocking Extraction:**
   - API calls are fire-and-forget (no await)
   - Prevents blocking frame analysis loop
   - Silent failure handling (retries on next interval)

5. **Replay Handling:**
   - Video seeks to start if ended before replay
   - QR URL restored immediately if user ID exists
   - Frame counters reset but extraction state preserved

### Implementation Checklist

- [ ] Video player component with custom controls
- [ ] Frame analysis hook with `requestAnimationFrame` loop
- [ ] Canvas initialization for frame capture
- [ ] Frame counting logic (increment on each frame)
- [ ] User ID extraction API call every 20 frames
- [ ] State management for `extractedUserId` and `qrUrl`
- [ ] QR code overlay rendering (conditional)
- [ ] State persistence across pause/play/end
- [ ] QR URL restoration on replay
- [ ] State reset on video change
- [ ] Error handling for CORS, API failures, etc.
- [ ] Cleanup on component unmount

### API Requirements

- `GET /api/videos/[id]/play?variant=watermarked` - Get playback URL
- `GET /api/videos/[id]/extract-user-id?frame_index=N` - Extract user ID
- `GET /profile/[userId]/qr` - Get QR code image

### External Service Requirements

- Watermark service endpoint: `POST /extract_user_id`
- Request body: `{ video_name, frame_index, bucket }`
- Response: `{ success: true, user_id: "..." }`

---

## Additional Notes

### Technology Stack (Reference Implementation)

- **Framework:** Next.js 14+ (React 18+)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** React Hooks (useState, useEffect, useRef)
- **Video:** HTML5 `<video>` element
- **Canvas:** HTML5 Canvas API
- **Animation:** `requestAnimationFrame`

### Browser Compatibility

- Modern browsers with HTML5 video support
- Canvas API support required
- CORS handling for cross-origin video sources
- `requestAnimationFrame` support (all modern browsers)

### Testing Considerations

1. **Frame Extraction:** Test with various video frame rates (24fps, 30fps, 60fps)
2. **Replay:** Verify QR code persists and restores correctly
3. **Error Handling:** Test with missing watermarked video, API failures, CORS issues
4. **Performance:** Verify frame analysis doesn't impact playback smoothness
5. **State Management:** Test video switching, player closing, rapid play/pause

---

**End of Document**

