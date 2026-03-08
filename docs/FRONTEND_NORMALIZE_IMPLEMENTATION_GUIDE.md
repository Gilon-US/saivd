# Frontend Implementation Guide: Normalize Video and Callback

This document describes how to integrate the **normalize video** flow and **callback endpoint** so the frontend can normalize uploads and receive progress updates. Use it with your frontend AI coder or as a handoff for developers.

---

## 1. When to Call Normalize

Call the backend **normalize** endpoint **immediately after the file upload to S3/Wasabi completes**. Do not wait for user action. The flow is:

1. User selects a video; frontend uploads it to S3/Wasabi (e.g. `uploads/{userId}/{videoId}.mp4` or similar).
2. **As soon as the upload finishes**, call `POST /normalize_video` with the uploaded object’s key and a **callback URL that includes the video ID as a query parameter**.
3. The backend will POST to your callback URL with progress and final status. Use the **video ID from the callback URL query** to update your database (e.g. normalization status, `output_location` for the `-clean` file).

---

## 2. Backend Normalize Endpoint

- **URL:** `POST {WATERMARK_API_BASE}/normalize_video`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input_location` | string | Yes | S3 key of the **uploaded** file (e.g. `uploads/123/video-uuid.mp4`). |
| `bucket` | string | No | S3/Wasabi bucket (default: `"saivd-app"`). |
| `output_location` | string | No | If omitted, backend derives it as same folder + `-clean` before `.mp4` (e.g. `uploads/123/video-uuid-clean.mp4`). |
| `callback_url` | string | No | Your app’s callback URL. **Include video ID as a query parameter** so you can update the correct record. |
| `callback_hmac_secret` | string | No | Required when `callback_url` is set. Same secret used to verify `X-Signature` on callbacks. |

**Important:** Put the **video ID in the callback URL** so your callback handler can identify which video the update is for and update your database accordingly. Example:

```text
https://your-app.com/api/webhooks/normalize?videoId=8670e607-7a42-493a-8434-4a4536c1bd58
```

---

## 3. Example: Call Normalize After Upload

After a successful upload, you have at least:

- `videoId` – your app’s video record ID (e.g. UUID).
- `s3Key` – the S3 key where the file was uploaded (e.g. `videos/954e3e6d` or `uploads/userId/videoId.mp4`).
- `bucket` – bucket name (e.g. `saivd-app`).

Then:

1. Build the callback URL with `videoId` as a query parameter.
2. Call the normalize endpoint with `input_location`, optional `bucket`, `callback_url`, and `callback_hmac_secret`.

**Example (pseudo-code):**

```typescript
const WATERMARK_API_BASE = process.env.WATERMARK_API_URL; // e.g. https://your-watermark-service.run.app
const NORMALIZE_CALLBACK_SECRET = process.env.NORMALIZE_CALLBACK_HMAC_SECRET;

async function afterUploadComplete(videoId: string, s3Key: string, bucket: string) {
  const callbackUrl = `${getAppBaseUrl()}/api/webhooks/normalize?videoId=${encodeURIComponent(videoId)}`;

  const response = await fetch(`${WATERMARK_API_BASE}/normalize_video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input_location: s3Key,
      bucket: bucket,
      callback_url: callbackUrl,
      callback_hmac_secret: NORMALIZE_CALLBACK_SECRET,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || response.statusText);
  }

  const data = await response.json();
  // Sync response: data.status === "success" | "failed", data.output_location, etc.
  // If you use callback, you can still update DB from the callback using videoId from URL.
  return data;
}
```

If the backend returns 200 with `status: "success"`, you can use `data.output_location` (the `-clean` key) immediately. If you rely on the callback for DB updates, use the callback payload and the **video ID from the callback URL** to update the correct video record.

---

## 4. Callback Endpoint You Must Implement

The backend will POST to the `callback_url` you provided. You must implement an HTTP endpoint that:

1. Accepts `POST` with JSON body.
2. Reads the **video ID from the query string** (e.g. `videoId`) so you know which video to update.
3. Verifies the `X-Signature` header (HMAC-SHA256 of the raw JSON body; see below).
4. Parses the JSON body and handles `status`: `"processing"` (progress) or `"success"` / `"failed"` (final).
5. Updates your database using the **video ID from the query parameter** (e.g. set normalization status, store `output_location` on success, or store error on failure).

### 4.1 Callback URL and video ID

- Backend calls the **exact** URL you sent, including query parameters.
- Recommended: use a single query parameter for the video ID, e.g. `?videoId=<uuid>`.
- Your handler should read `req.query.videoId` (or equivalent) and use it for all DB updates for that request.

### 4.2 Callback payload (body)

The body is JSON. Example fields:

| Field | Present | Description |
|-------|---------|-------------|
| `status` | Always | `"processing"` (in progress) or `"success"` or `"failed"` (final). |
| `message` | Always | Human-readable message (e.g. `"Downloading"`, `"Normalizing"`, `"Uploading"`, `"Completed"`, or error text). |
| `input_location` | Always | S3 key of the source file. |
| `output_location` | On success | S3 key of the normalized file (e.g. `...-clean.mp4`). |
| `job_id` | Optional | Backend job id if async is used. |
| `width`, `height`, `fps`, `frame_count` | On success (optional) | Video properties of the normalized file. |

- **Progress:** You will receive one or more POSTs with `status: "processing"` and `message` like `"Downloading"`, `"Normalizing"`, `"Uploading"`. Use these to show a progress UI; do not treat them as final.
- **Final:** Exactly one POST will have `status: "success"` or `status: "failed"`. On `"success"`, use `output_location` as the normalized S3 key (e.g. for the next step: watermark). On `"failed"`, use `message` for error display and DB.

### 4.3 Verifying the signature

Every callback request includes a header:

- **Header name:** `X-Signature`
- **Value:** HMAC-SHA256 of the **raw request body** (UTF-8), using your `callback_hmac_secret`, **hex-encoded**.

Verification steps:

1. Take the raw body (e.g. `req.body` as raw buffer or string; if your framework parses JSON, use the raw body before parsing).
2. Compute `HMAC-SHA256(secret, rawBody)` and hex-encode the result.
3. Compare with the `X-Signature` header using a constant-time compare (e.g. `crypto.timingSafeEqual`) to avoid timing attacks.

**Example (Node.js):**

```typescript
import crypto from "crypto";

function verifyNormalizeCallbackSignature(
  rawBody: Buffer | string,
  signatureHeader: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody);
  const expected = hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, "hex"), Buffer.from(expected, "hex"));
}
```

If verification fails, respond with 401 and do not update the database.

### 4.4 Example callback handler (pseudo-code)

```typescript
// POST /api/webhooks/normalize?videoId=...
async function handleNormalizeCallback(req, res) {
  const videoId = req.query.videoId;
  if (!videoId) {
    return res.status(400).json({ error: "Missing videoId query parameter" });
  }

  const rawBody = req.rawBody; // use raw body for signature verification (before JSON parse)
  const signature = req.headers["x-signature"];
  const secret = process.env.NORMALIZE_CALLBACK_HMAC_SECRET;

  if (!verifyNormalizeCallbackSignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload = JSON.parse(rawBody.toString("utf8"));
  const { status, message, input_location, output_location } = payload;

  if (status === "processing") {
    // Update UI or DB: normalization in progress (e.g. message: "Downloading" | "Normalizing" | "Uploading")
    await updateVideoNormalizationProgress(videoId, { status: "normalizing", message });
    return res.status(200).send();
  }

  if (status === "success") {
    // Store output_location (the -clean key) and mark normalization complete; then you can start watermark with output_location as input
    await updateVideoAfterNormalizeSuccess(videoId, {
      normalizationStatus: "completed",
      normalizedS3Key: output_location,
      ...(payload.width != null && { width: payload.width, height: payload.height, fps: payload.fps }),
    });
    return res.status(200).send();
  }

  if (status === "failed") {
    await updateVideoAfterNormalizeFailed(videoId, { normalizationStatus: "failed", error: message });
    return res.status(200).send();
  }

  return res.status(200).send();
}
```

Always return 200 for valid signatures so the backend does not retry. Use the **video ID from the query parameter** for every DB update.

---

## 5. End-to-End Flow Summary

1. **Upload**  
   User uploads video → frontend uploads to S3/Wasabi → you have `videoId` and `s3Key`.

2. **Normalize**  
   Right after upload, call `POST /normalize_video` with:
   - `input_location`: `s3Key`
   - `callback_url`: `https://your-app.com/api/webhooks/normalize?videoId=<videoId>`
   - `callback_hmac_secret`: your shared secret

3. **Callbacks**  
   Backend POSTs to that URL:
   - Several times with `status: "processing"` and `message` (e.g. "Downloading", "Normalizing", "Uploading") → update progress for `videoId` (from query).
   - Once with `status: "success"` and `output_location` → save `output_location` for `videoId`, mark normalization complete; optionally start watermark with `output_location` as input.
   - Or once with `status: "failed"` and `message` → save error for `videoId`, mark normalization failed.

4. **Next step (watermark)**  
   When normalization succeeds, call your existing watermark endpoint with `input_location` set to the **normalized** key (e.g. `output_location` from the callback or from the sync response).

---

## 6. Environment / Config

- `WATERMARK_API_URL` – base URL of the watermark/normalize service.
- `NORMALIZE_CALLBACK_HMAC_SECRET` – shared secret for normalize callbacks; same value you send as `callback_hmac_secret` and use to verify `X-Signature`.
- Your app base URL (e.g. `https://your-app.com`) to build `callback_url` with `?videoId=...`.

---

## 7. References

- **API reference:** `docs/API_REFERENCE.md` (Normalize Video and callback behavior).
- **Watermark flow after normalize:** Use `output_location` (the `-clean` key) as `input_location` for `POST /` (watermark).
- **Decoding and verification:** `docs/WATERMARK_DATA_AND_DECODING_GUIDE.md` (frontend decode from frame 0, etc.).
