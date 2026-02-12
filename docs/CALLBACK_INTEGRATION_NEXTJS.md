# Watermarking Callback Integration (Next.js Frontend)

This guide describes how to integrate the **watermarking completion callback** in a Next.js frontend so you are notified when an async watermark job finishes (success or failure) instead of relying only on polling.

---

## 1. Overview

- **When:** Callbacks are sent only for **async** jobs (`async_request: true`). Sync jobs return the result in the HTTP response; no callback.
- **What:** When the job completes, the backend **POSTs** to a URL you provide (`callback_url`) with a JSON body describing the job outcome and an **HMAC-SHA256** signature in the `X-Signature` header so you can verify the request came from your backend.
- **Requirements:** If you send `callback_url`, you **must** send `callback_hmac_secret` in the same request; otherwise the API returns **400**.

---

## 2. Sending the Request (Start Async Job with Callback)

When starting an async watermark job, add `callback_url` and `callback_hmac_secret` to the request body.

### 2.1 Callback URL

The callback URL must be a **publicly reachable** endpoint that can receive a POST from the watermark API (e.g. your production or staging domain). In Next.js you typically expose an **API Route** that will receive the callback.

- **App Router:** e.g. `POST /api/webhooks/watermark-complete`
- **Pages Router:** e.g. `pages/api/webhooks/watermark-complete.ts`

Use your deployed base URL, for example:

```ts
const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://yourapp.com';
const callbackUrl = `${baseUrl}/api/webhooks/watermark-complete`;
```

Avoid `localhost` unless you are testing with a tunnel (e.g. ngrok); the watermark service runs in ECS and cannot reach your local machine.

### 2.2 Shared Secret (HMAC)

- Generate or choose a **strong random secret** (e.g. 32+ bytes, store in env).
- Store it in **environment variables** (e.g. `WATERMARK_CALLBACK_HMAC_SECRET`) so it is never in client-side code.
- The **same secret** must be:
  1. Sent as `callback_hmac_secret` in the **POST /** request when starting the job (server-side only).
  2. Used in your **API Route** to verify the `X-Signature` header of incoming callbacks.

Only the server should know this secret; do not expose it to the browser.

### 2.3 Example: Starting an Async Job with Callback

Call the watermark API from **server-side** code (Server Action, API Route, or server component) so the secret is never sent to the client:

```ts
// Server-side only (e.g. in a Server Action or API Route)
const WATERMARK_API_URL = process.env.WATERMARK_API_URL!;
const CALLBACK_HMAC_SECRET = process.env.WATERMARK_CALLBACK_HMAC_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

const response = await fetch(`${WATERMARK_API_URL}/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    input_location: 'videos/in.mp4',
    output_location: 'videos/out.mp4',
    client_key: clientKeyPem,
    local_key: localKeyPem ?? undefined,
    user_id: userId,
    bucket: 'saivd-app',
    async_request: true,
    stream: true,
    callback_url: `${APP_URL}/api/webhooks/watermark-complete`,
    callback_hmac_secret: CALLBACK_HMAC_SECRET,
  }),
});
```

If `callback_url` is provided but `callback_hmac_secret` is missing or empty, the API returns **400** with `"callback_hmac_secret is required when callback_url is provided"`.

---

## 3. Callback Payload Shape

The backend POSTs a JSON body with the **same shape as the queue status** for a **single job**: each key has a **one-element array**.

| Key        | Type     | Example / Description                                      |
|-----------|----------|------------------------------------------------------------|
| `timestamp` | `string[]` | `["02_06_25_14_30_00"]` — job timestamp                    |
| `jobID`     | `number[]` | `[0]` — job index (use to correlate with your UI)          |
| `status`    | `string[]` | `["success"]` or `["failed"]`                              |
| `message`   | `string[]` | e.g. `["Watermarked video"]` or error message              |
| `path`      | `string[]` | e.g. `["s3://saivd-app/videos/out.mp4"]` or `["Error"]`   |
| `user_id`   | `string[]` | e.g. `["123456789"]` — user ID for the job                 |

Example **success** body:

```json
{
  "timestamp": ["02_06_25_14_30_00"],
  "jobID": [0],
  "status": ["success"],
  "message": ["Watermarked video"],
  "path": ["s3://saivd-app/videos/out.mp4"],
  "user_id": ["123456789"]
}
```

Example **failure** body:

```json
{
  "timestamp": ["02_06_25_14_31_00"],
  "jobID": [1],
  "status": ["failed"],
  "message": ["Error watermarking video stream: ..."],
  "path": ["Error"],
  "user_id": ["123456789"]
}
```

---

## 4. Verifying the Signature (API Route)

Every callback POST includes the header **`X-Signature`**: HMAC-SHA256 of the **raw JSON body** (UTF-8 bytes), hex-encoded. You **must** verify this before trusting the payload.

### 4.1 Steps

1. Read the **raw request body** as received (do not parse and re-serialize; use the exact bytes).
2. Get the shared secret (same value as `callback_hmac_secret` you sent when starting the job).
3. Compute **HMAC-SHA256(secret, rawBody)** and hex-encode.
4. Compare with the `X-Signature` header using a **constant-time** comparison to avoid timing attacks.

### 4.2 Next.js App Router Example (`app/api/webhooks/watermark-complete/route.ts`)

```ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SIGNATURE_HEADER = 'x-signature'; // lowercase as received

function verifySignature(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const received = Buffer.from(signatureHeader, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (received.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(received, expectedBuf);
}

export async function POST(request: NextRequest) {
  const secret = process.env.WATERMARK_CALLBACK_HMAC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // Get raw body (exact bytes sent by the backend)
  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);

  if (!verifySignature(Buffer.from(rawBody, 'utf-8'), signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as {
    timestamp: string[];
    jobID: number[];
    status: string[];
    message: string[];
    path: string[];
    user_id: string[];
  };

  const status = body.status?.[0];
  const jobID = body.jobID?.[0];
  const message = body.message?.[0];
  const path = body.path?.[0];
  const user_id = body.user_id?.[0];

  if (status === 'success') {
    // Update your DB, invalidate cache, notify user, etc.
    // e.g. await updateJobStatus(user_id, jobID, 'completed', path);
  } else if (status === 'failed') {
    // Handle failure: update UI, log, retry policy, etc.
    // e.g. await updateJobStatus(user_id, jobID, 'failed', undefined, message);
  }

  return NextResponse.json({ received: true });
}
```

**Important:** In Next.js you must ensure the route receives the **raw** body for signature verification. If you use a body parser that has already consumed the stream, you may need to disable it for this route or use a pattern that preserves the raw buffer (e.g. `request.arrayBuffer()` then convert to string with same encoding, or framework-specific raw body access).

### 4.3 Pages Router Example (`pages/api/webhooks/watermark-complete.ts`)

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

const SIGNATURE_HEADER = 'x-signature';

export const config = {
  api: { bodyParser: false }, // so we get raw body
};

function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signatureHeader, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (received.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(received, expectedBuf);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.WATERMARK_CALLBACK_HMAC_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers[SIGNATURE_HEADER] as string | undefined;

  if (!verifySignature(rawBody, signature ?? null, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const body = JSON.parse(rawBody.toString('utf-8'));
  const status = body.status?.[0];
  const jobID = body.jobID?.[0];
  const path = body.path?.[0];
  const user_id = body.user_id?.[0];
  const message = body.message?.[0];

  if (status === 'success') {
    // Update DB / cache / notify user
  } else if (status === 'failed') {
    // Handle failure
  }

  res.status(200).json({ received: true });
}
```

---

## 5. Using the Callback in Your UI

- **Correlation:** Use `jobID` and `user_id` to match the callback to the job you started (e.g. store pending job IDs per user in DB or in-memory cache).
- **Success:** Update the job record, show “Completed” and the output `path` (e.g. S3 URL); optionally invalidate queries or refetch so the UI reflects the new state.
- **Failure:** Update the job record to failed, show `message` to the user or in logs; optionally offer retry.
- **Idempotency:** The backend may retry the callback in the future; design your handler so duplicate callbacks for the same job are safe (e.g. update status only if still “processing”).

---

## 6. Security Checklist

| Item | Action |
|------|--------|
| **Secret** | Store `WATERMARK_CALLBACK_HMAC_SECRET` in env (e.g. Vercel/Next.js env). Never in client bundle. |
| **Verification** | Always verify `X-Signature` with `crypto.timingSafeEqual`; reject unverified requests with 401. |
| **HTTPS** | Use `https` for `callback_url` in production so the callback POST is encrypted. |
| **URL** | Use a stable, public base URL; avoid localhost unless using a tunnel for tests. |

---

## 7. Optional: Fallback to Polling

You can keep **polling** `GET /queue_status/{user_id}` as a fallback (e.g. if the callback fails or is not configured). When using callbacks, you may poll less often or only until a timeout; once the callback is received, stop polling for that job.

---

## 8. API Reference Summary

| Request (POST /) | Type | Required when using callback |
|------------------|------|------------------------------|
| `callback_url` | string (http/https URL) | Yes |
| `callback_hmac_secret` | string | Yes (if `callback_url` is set) |

| Callback POST | |
|---------------|--|
| **URL** | Your `callback_url` |
| **Method** | POST |
| **Headers** | `Content-Type: application/json`, `X-Signature: <hex>` |
| **Body** | JSON: `timestamp`, `jobID`, `status`, `message`, `path`, `user_id` (each value is a one-element array) |
| **When** | Once per job, when the job finishes (success or failure); async jobs only |

For full API details (errors, validation), see **`docs/API_REFERENCE.md`**.
