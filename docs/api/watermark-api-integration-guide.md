# Watermark API Integration Guide (Next.js)

This document describes how to integrate a Next.js application with the SAIVD external watermarking API. It is intended as **AI LLM context** for implementing the same integration in another Next.js project. It reflects the current working implementation: proxy API routes, request/response shapes, polling, and queue clearing.

---

## 1. Overview

The external watermarking service provides:

- **Start watermarking**: Submit a video to be watermarked with a user ID (async).
- **Queue status**: Get the status of all watermarking jobs for a user.
- **Clear queue**: Remove completed jobs for a user from the external queue (call after persisting results).
- **Extract user ID**: Read the embedded user ID from a frame of a watermarked video (for verification).

Your Next.js app should **not** call the external API from the browser. Use **Next.js API routes** that:

1. Authenticate the user (e.g., Supabase Auth).
2. Resolve the user’s **numeric user ID** and any keys from your database.
3. Call the external watermark service server-side.
4. Return a normalized JSON response to the client.

---

## 2. Configuration

### 2.1 Environment Variables

| Variable | Description |
|----------|-------------|
| `WATERMARK_SERVICE_URL` | Base URL of the watermark API (e.g. `https://watermark.example.com`). No trailing slash required; code should normalize with `.replace(/\/+$/, "")`. |
| `WATERMARK_TIMEOUT_MS` | (Optional) Timeout in ms for the “start watermark” request. Default example: `300000` (5 minutes). |

### 2.2 Base URL Usage

Always build URLs like this:

```ts
const baseUrl = process.env.WATERMARK_SERVICE_URL?.replace(/\/+$/, "") ?? "";
const queueStatusUrl = `${baseUrl}/queue_status`;
```

Never assume a trailing slash on the base URL.

---

## 3. External API Endpoints (Contract)

All requests to the external API use **JSON** and `Content-Type: application/json` unless noted.

### 3.1 Start Watermarking

- **Endpoint**: `POST /`
- **Body**:
  - `input_location` (string): S3 key or path to source video.
  - `output_location` (string): S3 key or path for watermarked output.
  - `client_key` (string): PEM-encoded RSA private key.
  - `user_id` (number): 9-digit numeric user ID to embed.
  - `bucket` (string, optional): S3 bucket name.
  - `async_request` (boolean): Use `true` for async processing.
  - `stream` (boolean): Use `true` for streaming mode (recommended for large files).

**Success (async)**: HTTP 200, body e.g.:

```json
{
  "status": "processing",
  "message": "Check output at s3://bucket/key once processing is complete.",
  "path": "s3://bucket/key"
}
```

Treat 200 + `status === "processing"` + non-empty `path` as a successful enqueue.

### 3.2 Queue Status

- **Endpoint**: `POST /queue_status` (preferred) or `GET /queue_status/{user_id}` if your backend still supports it.
- **Preferred**: `POST /queue_status` with body: `{ "user_id": number }`.
- **No path parameter**: Send `user_id` only in the request body.

**Success**: HTTP 200, body with parallel arrays:

```json
{
  "timestamp": ["01_01_2024_12_00_00", "01_01_2024_12_05_00"],
  "jobID": ["0", "1"],
  "status": ["processing", "success"],
  "message": ["50.00%", "Watermarked video"],
  "path": ["s3://bucket/output1.mp4", "s3://bucket/output2.mp4"],
  "user_id": ["123456789", "123456789"]
}
```

- **Status values**: `"processing"`, `"success"`, `"completed"`, or `"failed"`. Treat both `"success"` and `"completed"` as completed.
- **Empty queue**: Same keys with empty arrays.

### 3.3 Clear Queue

- **Endpoint**: `POST /clear_queue`
- **Body**: `{ "user_id": number }`
- **No path parameter**: Do not put `user_id` in the URL path.

**Success**: HTTP 200, e.g. `{ "status": "cleared", "items_removed": 3 }` or `{ "status": "no items to clear" }`.

**When to call**: Only after you have **persisted** all completed job data (e.g. processed URLs, status) in your database. Call once when **all** jobs in the status response are completed for that user.

### 3.4 Extract User ID

- **Endpoint**: `POST /extract_user_id`
- **Body**:
  - `video_name` (string): S3 key or filename (with or without `.mp4`; API may accept both).
  - `frame_index` (number, optional): Default `0`.
  - `bucket` (string, optional): S3 bucket name.

**Success**: HTTP 200:

```json
{
  "success": true,
  "user_id": "123456789",
  "frame_index": 0,
  "video_name": "videos/my-video-watermarked.mp4"
}
```

**Failure**: HTTP 200 with `"success": false` or non-200; body may include `"error": "..."`.

---

## 4. Next.js API Route Structure

Recommended route layout:

- `POST /api/videos/[id]/watermark` – Start watermarking for video `[id]`.
- `GET /api/videos/watermark/status` – Poll: calls external queue_status, updates DB, optionally clears queue.
- `GET /api/videos/[id]/extract-user-id` – Extract user ID from watermarked video (e.g. for verification).

All routes must:

1. Ensure the user is authenticated.
2. Resolve **numeric user ID** (and RSA key for watermark start) from your `profiles` (or equivalent) table.
3. Call the external API and normalize errors into a consistent JSON shape for the client.

---

## 5. Start Watermark (Next.js Route)

- Load video by `[id]`, ensure it belongs to the current user.
- Load profile: `numeric_user_id`, `rsa_private` (PEM). If `rsa_private` is missing, generate an RSA key pair and save it to the profile, then use the private key.
- Build:
  - `input_location`: from video’s stored original key (e.g. `video.original_url`).
  - `output_location`: same key with suffix before extension, e.g. `inputLocation.replace(/(\.[^./]+)$/, "-watermarked$1")`.
- Request body:

```ts
const requestBody = {
  input_location: inputLocation,
  output_location: outputLocation,
  client_key: rsaPrivate,
  user_id: profile.numeric_user_id,
  bucket: process.env.WASABI_BUCKET_NAME ?? "saivd-app",
  async_request: true,
  stream: true,
};
```

- `fetch(watermarkServiceUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal })` with a timeout (e.g. `AbortController` + `setTimeout`).
- On 200 + `status === "processing"` + `path`, update the video row to `status: "processing"` and return success.
- On any other case, return 502 with a structured error (`success: false`, `error: { code, message }`).

---

## 6. Queue Status (Next.js Route)

- Authenticate user; fetch `numeric_user_id` from profile.
- Call external API:
  - **Preferred**: `POST ${baseUrl}/queue_status` with body `{ user_id: numericUserId }`.
- Parse response as JSON. Response has parallel arrays: `jobID`, `timestamp`, `status`, `message`, `path` (and optionally `user_id`).

**Path normalization**: Convert external `path` (e.g. `s3://bucket/key`) to a storage key:

```ts
function normalizeWatermarkPath(path: string): string {
  const match = path.match(/^s3:\/\/[^/]+\/(.+)$/);
  return match ? match[1] : path;
}
```

For each job with `status === "success"` or `status === "completed"` and a valid normalized path:

1. Derive the **original** key from the processed key, e.g. remove the `-watermarked` suffix:  
   `pathKey.replace(/-watermarked(\.[^./]+)$/, "$1")`.
2. Find the video row (e.g. by `user_id` and `original_url === originalKey`).
3. Update that row: set `processed_url` to the normalized path key, `status` to `"processed"`, and any other fields (e.g. thumbnails, `updated_at`). Optionally trigger side effects (e.g. email) and mark notification as sent.
4. Only after **all** such updates are persisted, check if **every** job in the response is completed (`status === "success"` or `"completed"`). If yes, call **clear_queue** (see below).

Return to the client a stable shape, e.g.:

```ts
return NextResponse.json({
  success: true,
  data: {
    jobs: jobsArray,           // normalized list with jobId, timestamp, status, message, path, pathKey
    videosUpdated: number,
    hasCompletedJobs: boolean,
  },
});
```

So the client can show progress and know when to refresh the list.

---

## 7. Clear Queue (Inside Status Route)

Call **only after** you have applied all completed jobs to your database.

- URL: `POST ${baseUrl}/clear_queue` (no path parameter).
- Body: `{ user_id: numericUserId }`.
- Do not fail the status request if clear_queue fails; log and continue. Clear is a cleanup step.

Example:

```ts
const clearQueueUrl = `${baseUrl}/clear_queue`;
const clearQueueResponse = await fetch(clearQueueUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ user_id: numericUserId }),
});
```

---

## 8. Extract User ID (Next.js Route)

- Authenticate user; load video by `[id]`, ensure it belongs to the user and has a watermarked file (e.g. `processed_url`).
- Build `video_name`: use the stored processed key (e.g. full S3 key including extension). If the value is a full URL, strip the origin and use the path (key).
- Optional: `frame_index` from query (e.g. `?frame_index=0`), default `0`.
- Request body:

```ts
const requestBody = {
  video_name: videoName,  // full key or filename
  frame_index: frameIndex,
  bucket: process.env.WASABI_BUCKET_NAME ?? "saivd-app",
};
```

- `POST ${baseUrl}/extract_user_id` with `Content-Type: application/json` and `body: JSON.stringify(requestBody)`.
- Parse JSON. If `response.ok` and payload `success === true` and `payload.user_id` is present, return:

```ts
return NextResponse.json({
  success: true,
  data: {
    user_id: payload.user_id,
    frame_index: payload.frame_index ?? frameIndex,
    video_name: payload.video_name ?? videoName,
  },
});
```

Otherwise return 502 with a structured error (e.g. `extraction_failed`).

---

## 9. Client-Side Usage

- **Start watermark**: `POST /api/videos/{id}/watermark` (no body). Then show “processing” and poll status.
- **Poll status**: `GET /api/videos/watermark/status` on an interval (e.g. every 2 seconds) while the videos list is visible. Use the returned `data.jobs` and `data.hasCompletedJobs` to update UI and refresh the video list when jobs complete.
- **Verification**: Before playing a watermarked video, call `GET /api/videos/{id}/extract-user-id?frame_index=0`. If the response has `data.user_id`, allow playback and optionally show a QR or “verified” state; otherwise show “not authentic” and block playback.

Cancel in-flight requests (e.g. `extract-user-id`) when the user closes the player (e.g. `AbortController`).

---

## 10. Error Handling and Logging

- Use a consistent error shape: `{ success: false, error: { code: string, message: string } }`.
- Map external errors to codes, e.g. `config_error`, `unauthorized`, `user_profile_error`, `watermark_status_error`, `watermark_error`, `watermark_timeout`, `extraction_failed`, `parse_error`, `server_error`.
- Log before/after external calls with full URL and method; log response status and body length (and body in dev if safe). Never log raw RSA keys or secrets; redact with e.g. `[REDACTED_CLIENT_KEY:${key.length}chars]`.
- For status and clear_queue, log failures but do not fail the main flow (e.g. 502) when only the cleanup (clear_queue) fails.

---

## 11. Data Model Assumptions

- **Profiles**: At least `id`, `numeric_user_id` (number), and optionally `rsa_public` / `rsa_private` (PEM strings). If `rsa_private` is null, generate a key pair and persist it.
- **Videos**: At least `id`, `user_id`, `original_url` (storage key for original), `processed_url` (storage key for watermarked file, null until done), `status` (e.g. `"processing"`, `"processed"`), and optionally `filename`, `notification_sent_at` for notifications.

---

## 12. Checklist for New Integrations

- [ ] Set `WATERMARK_SERVICE_URL` (and optional `WATERMARK_TIMEOUT_MS`).
- [ ] Implement `POST /api/videos/[id]/watermark` with auth, profile/video load, and async start.
- [ ] Implement `GET /api/videos/watermark/status`: auth, `numeric_user_id`, call `POST /queue_status` with `{ user_id }`, normalize paths, update DB for completed jobs, call `POST /clear_queue` with `{ user_id }` only after all updates.
- [ ] Implement `GET /api/videos/[id]/extract-user-id` with `video_name` as full key and optional `frame_index` and `bucket`.
- [ ] Use `normalizeWatermarkPath` for any `s3://...` path from the external API.
- [ ] Treat both `"success"` and `"completed"` as completed when matching jobs to DB rows and when deciding to clear the queue.
- [ ] Client: poll status every 2–5 seconds; call extract-user-id before allowing playback of watermarked video; cancel requests on close.

This guide, together with the external API reference (e.g. `API_REFERENCE.md` or `SAIVD_watermark_API.md`), is sufficient for an LLM to replicate the watermark API integration in another Next.js project.
