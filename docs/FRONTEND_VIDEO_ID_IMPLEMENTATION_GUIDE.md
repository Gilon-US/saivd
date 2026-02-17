# Frontend Implementation Guide: videoId API Changes

This guide describes how to update your frontend to work with the **required `video_id`** field in the watermarking API and the **`videoId`** returned in queue status and callbacks.

---

## 1. Summary of Changes

| Change | Description |
|--------|-------------|
| **Required `video_id`** | Every `POST /` request must include `video_id` (string). Requests without it return **400** with `"video_id is required"`. |
| **`video_id` in async response** | The async `POST /` response now includes `video_id`, echoing the value you sent. |
| **`videoId` in queue_status** | `GET /queue_status/{user_id}` now returns a `videoId` array aligned with `jobID`, `status`, `message`, etc. Use it to match status to the correct video in your UI. |
| **`videoId` in callbacks** | Callback payloads now include `videoId` (one-element array), same shape as queue status. |

---

## 2. Why video_id?

The frontend displays status/progress for multiple videos. Without a stable client-side identifier, you cannot reliably map `jobID` (a server-generated UUID) to the video row or card in your UI. By sending `video_id` with each request and receiving it back in queue status and callbacks, you can always match the correct video to its status.

**Use `video_id` as:**
- A database ID (e.g. `"video-123"`)
- A UUID you generate when the user initiates watermarking (e.g. `crypto.randomUUID()`)
- Any stable string that uniquely identifies the video in your UI for this user session

---

## 3. Updating the Watermark Request

Add `video_id` to every `POST /` request. It must be a non-empty string.

### 3.1 Before (will return 400)

```ts
const response = await fetch(`${WATERMARK_API_URL}/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    input_location: 'videos/in.mp4',
    output_location: 'videos/out.mp4',
    client_key: clientKeyPem,
    user_id: userId,
    bucket: 'saivd-app',
    async_request: true,
    stream: true,
  }),
});
```

### 3.2 After

```ts
const videoId = video.id; // e.g. from your DB or state

const response = await fetch(`${WATERMARK_API_URL}/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    video_id: videoId,  // Required
    input_location: 'videos/in.mp4',
    output_location: 'videos/out.mp4',
    client_key: clientKeyPem,
    user_id: userId,
    bucket: 'saivd-app',
    async_request: true,
    stream: true,
  }),
});
```

---

## 4. Using videoId in Queue Status

`GET /queue_status/{user_id}` returns arrays of equal length. Use the **index** to correlate `jobID`, `status`, `message`, `path`, and `videoId`. Use `videoId[i]` to update the correct video in your UI.

### 4.1 Response Shape

```json
{
  "timestamp": ["02_06_25_14_30_00", "02_06_25_14_35_00"],
  "jobID": ["a1b2c3...", "d4e5f6..."],
  "status": ["processing", "success"],
  "message": ["50.00%", "Watermarked video"],
  "path": ["s3://saivd-app/out1.mp4", "s3://saivd-app/out2.mp4"],
  "user_id": ["123456789", "123456789"],
  "videoId": ["video-001", "video-002"]
}
```

### 4.2 Example: Polling and Updating UI by videoId

```ts
interface QueueJob {
  jobID: string;
  status: string;
  message: string;
  path: string;
  videoId: string;
}

async function pollQueueStatus(userId: string): Promise<QueueJob[]> {
  const res = await fetch(`${WATERMARK_API_URL}/queue_status/${userId}`);
  const data = await res.json();

  if (data.jobID.length === 0) return [];

  return data.jobID.map((jobID: string, i: number) => ({
    jobID,
    status: data.status[i],
    message: data.message[i],
    path: data.path[i],
    videoId: data.videoId?.[i] ?? '',
  }));
}

// In your component: update state by videoId
useEffect(() => {
  const interval = setInterval(async () => {
    const jobs = await pollQueueStatus(userId);
    jobs.forEach((job) => {
      setVideoStatus((prev) => ({
        ...prev,
        [job.videoId]: { status: job.status, message: job.message, path: job.path },
      }));
    });
  }, 5000);
  return () => clearInterval(interval);
}, [userId]);
```

---

## 5. Using videoId in Callbacks

When you use `callback_url` and `callback_hmac_secret`, the callback payload includes `videoId`. Use it to update the correct video without polling.

### 5.1 Callback Payload Shape

Each key has a **one-element array**:

| Key | Example |
|-----|---------|
| `timestamp` | `["02_06_25_14_30_00"]` |
| `jobID` | `["a1b2c3..."]` |
| `status` | `["success"]` or `["failed"]` |
| `message` | `["Watermarked video"]` |
| `path` | `["s3://saivd-app/out.mp4"]` |
| `user_id` | `["123456789"]` |
| `videoId` | `["video-001"]` |

### 5.2 Example: Webhook Handler (Next.js API Route)

```ts
// pages/api/webhooks/watermark-complete.ts (or app/api/webhooks/watermark-complete/route.ts)

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.headers['x-signature'] as string;
  const secret = process.env.WATERMARK_CALLBACK_HMAC_SECRET!;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = JSON.parse(rawBody);
  const videoId = payload.videoId?.[0] ?? '';
  const status = payload.status?.[0] ?? 'unknown';
  const message = payload.message?.[0] ?? '';
  const path = payload.path?.[0] ?? '';

  // Update your DB or notify the client for this videoId
  await updateVideoWatermarkStatus(videoId, { status, message, path });

  return res.status(200).json({ ok: true });
}
```

---

## 6. TypeScript Interfaces

```ts
interface WatermarkRequest {
  video_id: string;  // Required
  input_location: string;
  output_location: string;
  client_key: string;
  local_key?: string;
  user_id: number | string;
  bucket?: string;
  async_request?: boolean;
  stream?: boolean;
  callback_url?: string;
  callback_hmac_secret?: string;
}

interface AsyncWatermarkResponse {
  status: 'processing';
  message: string;
  path: string;
  job_id: string;
  video_id: string;
}

interface QueueStatusResponse {
  timestamp: string[];
  jobID: string[];
  status: string[];
  message: string[];
  path: string[];
  user_id: string[];
  videoId: string[];
}

interface CallbackPayload {
  timestamp: string[];
  jobID: string[];
  status: string[];
  message: string[];
  path: string[];
  user_id: string[];
  videoId: string[];
}
```

---

## 7. Migration Checklist

- [ ] Add `video_id` to every `POST /` request body (sync and async).
- [ ] Ensure `video_id` is a non-empty string (e.g. from `video.id`, `crypto.randomUUID()`, or similar).
- [ ] Update queue status polling to use `videoId[i]` when mapping status to UI.
- [ ] Update callback handler to read `videoId[0]` and update the correct video.
- [ ] Add error handling for `400` with `"video_id is required"` (e.g. show a user-friendly message).
- [ ] Update TypeScript types / API client to include `video_id` and `videoId`.

---

## 8. Error Handling

If you omit `video_id` or send an empty string, the API returns:

```json
{
  "detail": "video_id is required"
}
```

Handle this in your API client and surface a clear message to the user (e.g. "An error occurred: video identifier is required").
