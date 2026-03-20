# Watermarked Video Playback Implementation (Current SAIVD App)

> V2 update: runtime now includes continuous every-10th-frame verification during playback (after bootstrap success), with one inconclusive grace checkpoint and immediate stop on cryptographic mismatch.

## 1. Purpose and Scope

This document describes the **current implementation** of watermarked video playback and verification in the SAIVD Next.js app. It is intended as **implementation context** for another dedicated player application that:

- Has **its own video storage and playback pipeline** (e.g. its own CDN / S3 bucket).
- Wants to **verify SAIVD-style watermarks during playback** and show the same QR overlay behavior.
- Will **fetch the RSA public key from this SAIVD app** for verification.

> Base URL for this SAIVD app (for API calls from the external player):  
> **`http://saivd.netlify.app`**

The focus here is on:

- How the current player verifies watermarked videos.
- How it derives the **creator numeric user ID** from the watermark.
- How it uses that ID and the SAIVD **public-key API** to validate the watermark and show a QR overlay.

All storage-specific pieces (SAIVD’s own Wasabi/S3 keys, presigned URLs, etc.) should be replaced by the external app’s own storage logic. The **verification logic and API contracts** should remain compatible.

---

## 2. High-Level Playback and Verification Flow

### 2.1 Overview

At a high level, the current SAIVD player does the following for a watermarked video:

1. **Obtain a playback URL** for the watermarked video (SAIVD uses a Next.js API that returns a presigned S3 URL; an external app will use its own storage URL).
2. **Block playback** until the watermark is verified.
3. **Verify watermark on frame 0** entirely on the **client** using WebCodecs + a public RSA key:
   - Decode the video’s **frame 0** luma (Y plane).
   - Extract the **numeric_user_id** from the watermark encoding.
   - Call a SAIVD API to fetch the **public RSA key** for that numeric user ID.
   - Optionally verify the watermark signature for frame 0 with that key.
4. If verification succeeds:
   - Allow playback.
   - Show a **QR overlay** that links to the creator’s profile.
5. If verification fails:
   - Block playback and show an error overlay.

The current implementation **only verifies frame 0** (no subsequent per-frame RSA verification is active yet). That is important for matching behavior.

---

## 3. Key Components and Hooks

### 3.1 `VideoGrid` → `VideoPlayer` (entry point)

File: `src/components/video/VideoGrid.tsx`

- When the user clicks to play the **watermarked** variant of a video, SAIVD:
  - Calls `GET /api/videos/[id]/play?variant=watermarked` to get a **playback URL**.
  - Opens `VideoPlayer` with:
    - `videoUrl`: the playback URL.
    - `videoId`: the SAIVD video ID (UUID).
    - `enableFrameAnalysis: true`.
    - `verificationStatus: "verifying"`.
    - `verifiedUserId: null`.

In an external app, you can skip SAIVD’s `/play` endpoint and instead directly use **your own** watermarked video URL, but you should still:

- Pass that URL into your player component.
- Treat it as a **watermarked video that must be verified** before playback.

### 3.2 `VideoPlayer` (UI + orchestration)

File: `src/components/video/VideoPlayer.tsx`

Key responsibilities:

- Renders the `<video>` element with custom controls.
- **Blocks playback** until verification completes successfully.
- Wires up:
  - `useWatermarkVerification` for **verification** (frame 0 + RSA).
  - `useFrameAnalysis` for QR overlay and (future) additional analysis.

Important props:

```ts
interface VideoPlayerProps {
  videoUrl: string;              // Watermarked video playback URL (external app: your own URL)
  videoId?: string | null;       // SAIVD video ID (used only for QR URL construction and backend APIs)
  onClose: () => void;
  isOpen: boolean;
  enableFrameAnalysis: boolean;  // true for watermarked videos
  verificationStatus?: "verifying" | "verified" | "failed" | null;
  verifiedUserId?: string | null;
  onVerificationComplete?: (status: "verified" | "failed", userId: string | null) => void;
}
```

Playback gating logic:

- `isPlaybackAllowed = (verificationStatus === null || verificationStatus === "verified")`.
- `togglePlay()` returns early if `!isPlaybackAllowed` (no play when verification failed or still running).

Verification integration:

- `useWatermarkVerification(videoRef, videoUrl, { enabled, onVerificationComplete })`
  - `enabled` is true when:
    - `enableFrameAnalysis` is true,
    - `verificationStatus === "verifying"`,
    - `isOpen` and `videoUrl` are truthy.
- When verification completes, `onVerificationComplete` updates parent state:
  - status `"verified"` or `"failed"`.
  - `verifiedUserId` when successful.

QR overlay:

- `useFrameAnalysis(videoRef, isPlaying, analysisFunction, videoId)` returns `frameAnalysisQrUrl`.
- Current implementation **prefers the verified user ID**:

```ts
const qrUrl = verifiedUserId ? `/profile/${verifiedUserId}/qr` : frameAnalysisQrUrl;
```

In an external app, you likely want:

- QR URL = something like `https://your-app/profile/{numeric_user_id}/qr` or a deep link into your own UI.

---

## 4. Watermark Verification Logic (`useWatermarkVerification`)

File: `src/hooks/useWatermarkVerification.ts`

This hook encapsulates the **client-side verification pipeline**:

1. **Capture frame 0** from the video using **WebCodecs**, not canvas, to avoid CORS/tainting issues.
2. **Decode the numeric user ID** from the watermark encoding in the luma plane.
3. **Fetch the public RSA key** from the SAIVD app using that numeric ID.
4. Optionally verify the watermark signature for frame 0.
5. Set verification status + user ID back into React state.

### 4.1 Hook signature

```ts
export type WatermarkVerificationStatus = "idle" | "verifying" | "verified" | "failed";

type UseWatermarkVerificationOptions = {
  enabled: boolean; // When true, run verification
  onVerificationComplete?: (status: "verified" | "failed", userId: string | null) => void;
};

export function useWatermarkVerification(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  videoUrl: string | null,
  options: UseWatermarkVerificationOptions
)
```

### 4.2 Frame 0 decode and numeric ID extraction

Steps (simplified):

1. When `enabled` is true and both `videoUrl` and `videoRef.current` are available:
   - Set internal status to `"verifying"`.
   - Seek the video to time `0` and wait for `loadeddata` + `seeked`.
2. Use a helper (current app: `captureFrame0YFromUrl(videoUrl)`) to:
   - Demux the video stream.
   - Decode **frame 0** Y (luma) plane via WebCodecs.
   - Return `{ yPlane: Uint8Array, width: number, height: number }`.
3. Call `decodeNumericUserIdFromLuma(yPlane, width, height)` to recover `numeric_user_id` from the right-hand watermark region of that frame.

> For the external app: you will need an equivalent of `captureFrame0YFromUrl` and `decodeNumericUserIdFromLuma`. The current SAIVD implementation uses a patch-grid and row-sum encoding; replicate the same algorithm or reuse a port of `decodeNumericUserIdFromLuma`.

If frame 0 cannot be decoded or `numeric_user_id` is invalid, verification fails with status `"failed"` and playback remains blocked.

### 4.3 Fetching the public RSA key

Once `numeric_user_id` is available, SAIVD fetches the **public RSA key** via:

- **Endpoint:** `GET /api/users/{numericUserId}/public-key`
- **Full URL from an external app:**  
  `http://saivd.netlify.app/api/users/{numericUserId}/public-key`

Response shape (success):

```json
{
  "success": true,
  "data": {
    "public_key_pem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
  }
}
```

Client-side helper (simplified from `src/lib/watermark-verification.ts`):

```ts
async function fetchPublicKeyPem(numericUserId: number): Promise<string> {
  const res = await fetch(`http://saivd.netlify.app/api/users/${numericUserId}/public-key`);
  if (!res.ok) throw new Error("Failed to fetch public key");
  const data = await res.json();
  if (!data.success || !data.data?.public_key_pem) {
    throw new Error("Invalid public key response");
  }
  return data.data.public_key_pem;
}
```

Then the PEM is imported into a `CryptoKey` via Web Crypto (RSA-OAEP or RSASSA-PKCS1-v1_5, depending on the watermark scheme).

### 4.4 Frame 0 RSA verification

If a public key is successfully imported and the Y-plane for frame 0 is available, the current app:

- Calls `decodeAndVerifyFrameFromLuma(publicKey, yPlane, width, height)`, which:
  - Re-computes the right-hand luma row sums.
  - Recovers the **signature** embedded in the left-hand region.
  - Verifies the signature using the RSA public key.

Result:

- On success: internal status `"verified"`, `verifiedUserId = String(numeric_user_id)`, and the `onVerificationComplete("verified", userId)` callback fires.
- On failure: internal status `"failed"` and `onVerificationComplete("failed", null)` fires.

> Current production behavior: **only frame 0** is verified. Comments mention future verification of frames 10, 20, … but that code path is disabled.

---

## 5. QR Overlay and User Experience

Once verification succeeds:

1. `VideoGrid` receives the `"verified"` status and `verifiedUserId` from `VideoPlayer` via `onVerificationComplete`.
2. `VideoPlayer` constructs a QR URL using the verified ID:

```ts
const qrUrl = verifiedUserId ? `/profile/${verifiedUserId}/qr` : frameAnalysisQrUrl;
```

3. The QR overlay:
   - Is shown in the **top-left corner** of the video (`absolute top-2 left-2`).
   - Uses a flip animation between the QR code and a logo.
   - Remains visible while playback is allowed.

In an external app, you can:

- Use the decoded `numeric_user_id` directly to form your own profile/QR URL.
- Or still embed SAIVD profile URLs: `http://saivd.netlify.app/profile/{numeric_user_id}/qr`.

---

## 6. What an External Player Needs to Implement

Assuming your app already has:

- Its own watermarked video files.
- A way to render video (HTML `<video>` or native player).

To match SAIVD’s behavior, the external player should:

1. **Block playback until verification completes.**
2. **On video load (for a watermarked asset):**
   - Seek to frame 0 and capture the luma plane (e.g. via WebCodecs or native equivalent).
   - Run the **numeric_user_id decode** algorithm against that luma plane.
3. **Fetch RSA public key from SAIVD:**
   - `GET http://saivd.netlify.app/api/users/{numericUserId}/public-key`.
4. **Verify watermark signature for frame 0** using that key (matching SAIVD’s luma/patch/signature scheme).
5. **If verified:**
   - Allow playback.
   - Show a QR overlay derived from `numeric_user_id` (either to your own profile UI or SAIVD’s).
6. **If verification fails:**
   - Block playback, show an error, or mark the video as non-authentic.

You **do not** need to:

- Use SAIVD’s `/api/videos/[id]/play` endpoint (your app has its own storage).
- Use SAIVD’s `/api/videos/[id]/extract-user-id` endpoint (that is a server-driven route against the watermark service).

The only cross-app dependency is:

- **Public-key API:** `GET http://saivd.netlify.app/api/users/{numericUserId}/public-key`.

Everything else (frame decode, numeric ID decoding, RSA verification, playback UI, QR overlay) should be reimplemented in your dedicated player using this document as a reference.

