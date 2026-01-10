# Video Watermarking Flow: Step-by-Step Guide

This document provides a detailed step-by-step explanation of how video watermarking works in the SAVD app, from file upload completion through processing and thumbnail display.

## Overview

The watermarking process involves:
1. Video upload and confirmation
2. User-initiated watermarking request
3. Asynchronous processing by external service
4. Status polling and updates
5. Completion and thumbnail display

---

## Step 1: File Upload Completion

**Location:** `src/hooks/useVideoUpload.ts` → `uploadVideo()`

### Process:
1. **Upload Phase 1 - Preparing:**
   - Generates thumbnail preview using browser's video element
   - Creates base64-encoded thumbnail data URL

2. **Upload Phase 2 - Requesting URL:**
   - Calls `/api/videos/upload` to get pre-signed POST URL
   - Key format: `videos/{userId}/{timestamp}-{uuid}.{extension}`

3. **Upload Phase 3 - Uploading:**
   - Uploads file directly to Wasabi using pre-signed POST URL
   - Tracks upload progress (bytes uploaded, speed, time remaining)

4. **Upload Phase 4 - Confirming:**
   - Calls `/api/videos/confirm` after upload completes

### API: POST `/api/videos/confirm`
**Location:** `src/app/api/videos/confirm/route.ts`

**What happens:**
- Verifies file exists in Wasabi using `HeadObjectCommand`
- Stores video metadata in Supabase:
  ```typescript
  {
    user_id: user.id,
    filename: file.name,
    filesize: file.size,
    content_type: contentType,
    original_url: key,  // e.g., "videos/userId/timestamp-uuid.mp4"
    original_thumbnail_url: null,  // Currently null
    preview_thumbnail_data: previewThumbnailData,  // Base64 data URL
    status: "uploaded",
    upload_date: ISO timestamp
  }
  ```
- Returns video record with ID

**Result:** Video appears in dashboard with status "uploaded" and original thumbnail

---

## Step 2: User Initiates Watermarking

**Location:** `src/components/video/VideoGrid.tsx` → `handleCreateWatermark()`

### Process:
1. User clicks watermark button (upload icon) on video card
2. Shows toast notification: "Creating watermarked version"
3. Makes API call: `POST /api/videos/{videoId}/watermark`

### API: POST `/api/videos/[id]/watermark`
**Location:** `src/app/api/videos/[id]/watermark/route.ts`

**What happens:**

1. **Authentication & Validation:**
   - Verifies user authentication
   - Loads video record and ensures it belongs to user
   - Loads user profile to get RSA keys and `numeric_user_id`

2. **Generate RSA Keys (if missing):**
   - If profile missing RSA keys, generates 2048-bit keypair
   - Stores public/private keys in profile

3. **Prepare Watermark Request:**
   - Gets `original_url` from video (e.g., `videos/userId/timestamp-uuid.mp4`)
   - Derives output location: `videos/userId/timestamp-uuid-watermarked.mp4`
   - Constructs request body:
     ```json
     {
       "input_location": "videos/userId/timestamp-uuid.mp4",
       "output_location": "videos/userId/timestamp-uuid-watermarked.mp4",
       "local_key": "<RSA_PRIVATE_KEY>",
       "client_key": "<RSA_PRIVATE_KEY>",
       "user_id": 30129560,  // numeric_user_id
       "bucket": "saivd-app",
       "async_request": true,
       "stream": true
     }
     ```

4. **Call External Watermark Service:**
   - POST to `{WATERMARK_SERVICE_URL}/`
   - Timeout: 5 minutes (configurable via `WATERMARK_TIMEOUT_MS`)

5. **Handle Response:**
   - External service returns:
     ```json
     {
       "status": "processing",
       "message": "9.09%",
       "path": "s3://bucket/videos/userId/timestamp-uuid-watermarked.mp4"
     }
     ```

6. **Update Database:**
   - Updates video record:
     ```typescript
     {
       status: "processing",
       updated_at: current timestamp
     }
     ```

7. **Return Response:**
   - Returns `{success: true, data: {video, message}}`
   - Frontend stores `message` in `pendingJobs` state
   - Frontend calls `onRefresh()` to update video list

**Result:** Video status changes to "processing", watermark card shows spinner with message

---

## Step 3: Status Polling

**Location:** `src/components/video/VideoGrid.tsx` → `useEffect` polling

### Process:
1. **Polling Setup:**
   - Polls `/api/videos/watermark/status` every 10 seconds
   - Uses refs to prevent memory leaks (only re-runs if `onSilentRefresh` changes)
   - Runs continuously while video grid is visible

2. **Polling Logic:**
   ```typescript
   // Initial poll immediately, then every 10 seconds
   void poll();
   const intervalId = setInterval(() => {
     void poll();
   }, 10000);
   ```

### API: GET `/api/videos/watermark/status`
**Location:** `src/app/api/videos/watermark/status/route.ts`

**What happens:**

1. **Fetch Queue Status:**
   - Calls external API: `GET {WATERMARK_SERVICE_URL}/queue_status`
   - External API returns all jobs:
     ```json
     {
       "timestamp": ["01_06_26_18_37_09", "01_06_26_21_22_39"],
       "jobID": ["0", "1"],
       "status": ["success", "processing"],
       "message": ["Watermarked video", "9.09%"],
       "path": ["s3://bucket/...watermarked.mp4", "None"]
     }
     ```

2. **Process Jobs:**
   - Parses response and normalizes paths
   - Extracts key from S3 path: `videos/userId/timestamp-uuid-watermarked.mp4`

3. **Update Pending Jobs (Frontend State):**
   - Matches jobs to videos by deriving original key from processed key
   - Updates `pendingJobs` state with latest messages
   - For processing jobs: Shows progress message (e.g., "9.09%")
   - Truncates messages to 32 characters with ellipsis

4. **Update Completed Videos:**
   - For jobs with `status: "success"` or `status: "completed"`:
     - Derives original key: removes `-watermarked` suffix
     - Finds video by matching `original_url` to derived key
     - Updates database:
       ```typescript
       {
         processed_url: job.pathKey,  // Full path with -watermarked
         processed_thumbnail_url: original_thumbnail_url,  // Uses original thumbnail
         status: "processed",
         updated_at: current timestamp
       }
       ```

5. **Return Response:**
   ```json
   {
     "success": true,
     "data": {
       "jobs": [...],
       "videosUpdated": 1,
       "hasCompletedJobs": true
     }
   }
   ```

6. **Frontend Refresh:**
   - If `hasCompletedJobs` or `videosUpdated > 0` or processing videos exist:
     - Calls `onSilentRefresh()` to re-fetch videos from database
     - UI updates to show new status and thumbnails

**Result:** 
- Processing videos show updated progress messages
- Completed videos have status updated to "processed" in database
- Video list refreshes to show completed state

---

## Step 4: Thumbnail Display

**Location:** `src/components/video/VideoGrid.tsx` → Video card rendering

### Display Logic:

**Original Video Thumbnail (Always Available):**
```typescript
{video.preview_thumbnail_data ? (
  // Base64 data URL from browser-generated preview
  <img src={video.preview_thumbnail_data} />
) : video.original_thumbnail_url ? (
  // Server-generated thumbnail (if available)
  <Image src={video.original_thumbnail_url} />
) : (
  // Fallback: "No preview" placeholder
)}
```

**Watermarked Video Thumbnail (Based on Status):**

1. **Status: "processed"** (Watermarking Complete):
   ```typescript
   {video.status === "processed" && (
     {video.processed_thumbnail_url ? (
       <Image src={video.processed_thumbnail_url} />  // Dedicated thumbnail
     ) : video.preview_thumbnail_data ? (
       <img src={video.preview_thumbnail_data} />  // Use original preview
     ) : (
       <Image src={video.original_thumbnail_url} />  // Use original thumbnail
     )}
     // Thumbnail is clickable to play watermarked video
   )}
   ```

2. **Status: "processing"** (Watermarking In Progress):
   ```typescript
   {video.status === "processing" && (
     <div>
       <LoadingSpinner />
       <span>{truncateText(pendingJobs[video.id]?.message ?? "Processing...", 32)}</span>
     </div>
   )}
   ```
   - Shows spinner
   - Displays progress message (e.g., "9.09%")
   - Message updated from polling status API

3. **Status: "uploaded"** (Not Yet Watermarked):
   ```typescript
   {video.status === "uploaded" && (
     <div>
       <span>No watermarked version</span>
       <Button onClick={() => handleCreateWatermark(video)}>
         <UploadIcon />  // Watermark button
       </Button>
     </div>
   )}
   ```

4. **Status: "failed"** (Watermarking Failed):
   ```typescript
   {video.status === "failed" && (
     <div>
       <span className="text-red-500">Processing failed</span>
     </div>
   )}
   ```

---

## Step 5: Video Playback with QR Code

**Location:** `src/components/video/VideoPlayer.tsx` + `src/hooks/useFrameAnalysis.ts`

### Process (When Watermarked Video is Played):

1. **Video Opens:**
   - `handleVideoClick(video, "watermarked")` called
   - Fetches playback URL: `GET /api/videos/{videoId}/play?variant=watermarked`
   - Opens `VideoPlayer` with `enableFrameAnalysis={true}` and `videoId={videoId}`

2. **Frame Analysis Begins:**
   - `useFrameAnalysis` hook initializes
   - Starts `requestAnimationFrame` loop when video plays

3. **Frame Counting:**
   - Counts frames: `frameCountRef.current++`
   - Every 20 frames, calls extract-user-id API

4. **Extract User ID:**
   - API: `GET /api/videos/{videoId}/extract-user-id?frame_index={frameCount}`
   - Next.js route calls external API:
     ```json
     {
       "video_name": "videos/userId/timestamp-uuid-watermarked.mp4",
       "frame_index": 20,
       "bucket": "saivd-app"
     }
     ```
   - External API returns:
     ```json
     {
       "success": true,
       "user_id": "30129560",
       "frame_index": 120,
       "video_name": "videos/userId/timestamp-uuid-watermarked.mp4"
     }
     ```

5. **Set QR Code URL:**
   - `useFrameAnalysis` receives `user_id`
   - Sets `extractedUserId` state
   - Separate `useEffect` watches `extractedUserId` and sets:
     ```typescript
     qrUrl = `/profile/${extractedUserId}/qr`
     ```

6. **Display QR Code Overlay:**
   - `VideoPlayer` renders QR code:
     ```typescript
     {qrUrl && (
       <div className="absolute top-2 left-2">
         <img src={qrUrl} alt="Creator QR code" />
       </div>
     )}
     ```
   - QR code image fetched from: `/profile/30129560/qr`
   - This route generates/downloads QR code from Wasabi and returns PNG

**Result:** QR code overlay appears on watermarked video showing creator's profile QR code

---

## Key Data Flows

### File Path Formats:

**Upload:**
- Stored in DB: `videos/{userId}/{timestamp}-{uuid}.mp4`
- Example: `videos/954e3e6d-5906-4929-a87a-3b32d1b3b808/1767583221506-a186b567-3bf1-40c9-b2b8-f4f7529f65cb.mp4`

**Watermarked:**
- Stored in DB: `videos/{userId}/{timestamp}-{uuid}-watermarked.mp4`
- Example: `videos/954e3e6d-5906-4929-a87a-3b32d1b3b808/1767583221506-a186b567-3bf1-40c9-b2b8-f4f7529f65cb-watermarked.mp4`

### Database Status Transitions:

```
"uploaded" → (user clicks watermark) → "processing" → (polling detects completion) → "processed"
```

### Thumbnail Priority (Watermarked Video):

1. `processed_thumbnail_url` (if exists)
2. `preview_thumbnail_data` (browser-generated, base64)
3. `original_thumbnail_url` (server-generated, if exists)

---

## Error Handling

### Upload Errors:
- Network errors: Retry with backoff
- Validation errors: Show error toast, don't create record

### Watermark Request Errors:
- Missing profile data: Return 400 error
- External API timeout: Return 504 error (5 minute timeout)
- External API error: Return 502 error with message

### Status Polling Errors:
- Continues polling on errors (logs to console)
- Database update failures: Logged but don't block other jobs

### Frame Analysis Errors:
- API failures: Logged, QR code not shown
- Canvas tainted (CORS): Uses dummy frame data, continues
- Missing user ID: QR code not displayed

---

## Performance Considerations

1. **Polling Interval:** 10 seconds - balances responsiveness vs. server load
2. **Frame Extraction:** Every 20 frames - balances accuracy vs. API calls
3. **Silent Refresh:** Uses `silent: true` flag to avoid loading indicators during polling
4. **Memory Management:** Uses refs to prevent effect re-runs and memory leaks
5. **Thumbnail Caching:** Browser-generated previews cached in database as base64

---

## Summary

The complete flow:
1. ✅ Upload → Store with status "uploaded" → Show original thumbnail
2. ✅ Click watermark → Request processing → Status "processing" → Show spinner + message
3. ✅ Poll every 10s → Check queue status → Update messages → Detect completion
4. ✅ Completion detected → Update DB to "processed" → Refresh UI → Show thumbnail
5. ✅ Play watermarked video → Extract user ID every 20 frames → Display QR code overlay

