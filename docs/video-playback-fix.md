# Video Playback Fix – Wasabi/S3 URL Handling

This document explains the changes made to fix video playback in the SAIVD Viewer dashboard when using Wasabi (S3-compatible) storage. It is written so another agent can replicate the same pattern in a similar codebase.

## Problem Summary

- Dashboard showed video thumbnails correctly.
- Clicking a video opened the custom `VideoPlayer`, but playback failed with:
  - Browser error: `NotSupportedError: The element has no supported sources.`
  - Opening the video URL directly returned a Wasabi XML error:
    ```xml
    <Error>
      <Code>AccessDenied</Code>
      <Message>Public use of objects is not allowed by this account.</Message>
      ...
    </Error>
    ```
- Root cause: the app was using **public HTTP URLs** to access video objects, but the Wasabi account/bucket **disallows public access**. The HTML5 `<video>` tag was receiving an XML error page instead of video bytes.

## Design Principles

1. **Never store temporary URLs in the database**
   - Do **not** persist presigned URLs or any URL that may change or expire.
2. **Store a stable identifier only**
   - Persist the **object key** (e.g. `uploads/{userId}/{uuid}.mp4`) as the source of truth.
3. **Generate access URLs on demand**
   - When a user wants to play a video, generate a **fresh URL** (public or presigned) from the key.
4. **Keep objects private by default**
   - Use **presigned URLs** if the storage account or bucket does not allow public object reads.

## Key Changes

### 1. Wasabi Client & URL Helpers

**File:** `src/lib/wasabi.ts`

- Provides a configured `S3Client` for Wasabi using environment variables.
- Exposes `WASABI_BUCKET` constant.

**File:** `src/lib/wasabi-urls.ts`

Added helper functions:

```ts
import {GetObjectCommand} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {wasabiClient, WASABI_BUCKET} from "./wasabi";

export async function generatePresignedVideoUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: WASABI_BUCKET,
    Key: key,
  });

  return getSignedUrl(wasabiClient, command, {expiresIn});
}

export function generatePublicVideoUrl(key: string): string {
  const endpoint = process.env.WASABI_ENDPOINT?.replace("https://", "") || "s3.wasabisys.com";
  return `https://${WASABI_BUCKET}.${endpoint}/${key}`;
}

export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // Remove leading "/" from pathname
    return urlObj.pathname.substring(1);
  } catch {
    return null;
  }
}
```

> For private buckets, **use `generatePresignedVideoUrl`**. `generatePublicVideoUrl` is only safe if the bucket allows public reads.

---

### 2. Upload Confirmation – Store Key, Not URL

**File:** `src/app/api/videos/confirm/route.ts`

Original behavior (buggy design):

- Constructed a public Wasabi URL and stored it in `videos.original_url`.
- Example pattern:
  ```ts
  const videoUrl = `https://${WASABI_BUCKET}.s3.wasabisys.com/${key}`;
  original_url = videoUrl;
  ```

New behavior:

- Treats the **object key** as the stable identifier.
- Does **not** generate any URL at upload time.
- Stores the key in `videos.original_url`:

```ts
// Parse request body
const {key, filename, filesize, contentType, previewThumbnailData} = await request.json();

// Verify file exists in Wasabi (HeadObjectCommand) ...

// We now treat the object key as the stable value to persist.
// Public or presigned URLs will be generated on demand from this key.
console.log("Upload confirmation:", {
  key,
  filename,
  wasabi_endpoint: process.env.WASABI_ENDPOINT,
  wasabi_bucket: WASABI_BUCKET,
});

const thumbnailUrl = null;

// Store video metadata in Supabase.
// IMPORTANT: original_url now stores the stable object key, not a URL.
const {data: video, error} = await supabase
  .from("videos")
  .insert({
    user_id: userData.user.id,
    filename,
    filesize,
    content_type: contentType,
    original_url: key,
    original_thumbnail_url: thumbnailUrl,
    preview_thumbnail_data: previewThumbnailData,
    status: "uploaded",
    upload_date: new Date().toISOString(),
  })
  .select()
  .single();
```

> Any similar codebase should adopt the same pattern: **store `key`, not URL**.

---

### 3. Playback Endpoint – Generate URL Per Request

**File:** `src/app/api/videos/[id]/play/route.ts`

New endpoint: `GET /api/videos/[id]/play`

Responsibilities:

1. Authenticate user via Supabase.
2. Ensure the video belongs to the authenticated user.
3. Resolve the storage key:
   - New rows: `videos.original_url` is the key.
   - Legacy rows: `videos.original_url` may be a full URL, so extract the key.
4. Generate a **presigned URL** from the key.
5. Return the presigned URL to the client.

Key implementation:

```ts
import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/utils/supabase/server";
import {generatePresignedVideoUrl, extractKeyFromUrl} from "@/lib/wasabi-urls";

export async function GET(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    const {id: videoId} = await context.params;

    const supabase = await createClient();
    const {data: authData} = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json(
        {success: false, error: {code: "unauthorized", message: "Authentication required"}},
        {status: 401}
      );
    }

    // Load the video record and ensure it belongs to the user
    const {data: video, error} = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", authData.user.id)
      .single();

    if (error || !video) {
      return NextResponse.json({success: false, error: {code: "not_found", message: "Video not found"}}, {status: 404});
    }

    // Determine the object key.
    // New behavior: original_url stores the key directly.
    // Legacy behavior: original_url may be a full URL, so extract the key.
    let key: string | null = null;

    if (video.original_url?.startsWith("http")) {
      key = extractKeyFromUrl(video.original_url);
    } else {
      key = video.original_url;
    }

    if (!key) {
      return NextResponse.json(
        {success: false, error: {code: "invalid_data", message: "Missing or invalid video storage key"}},
        {status: 500}
      );
    }

    // Generate a presigned URL from the key so that objects can remain private in Wasabi.
    const playbackUrl = await generatePresignedVideoUrl(key);

    return NextResponse.json({
      success: true,
      data: {playbackUrl},
    });
  } catch (error) {
    console.error("Error generating playback URL:", error);
    return NextResponse.json(
      {success: false, error: {code: "server_error", message: "Failed to generate playback URL"}},
      {status: 500}
    );
  }
}
```

> In another codebase: add a similar `/play` endpoint that takes a video ID, loads the row, resolves the key, and returns a **presigned** URL.

---

### 4. Frontend – Use `/play` Endpoint and Treat `original_url` as Key

**File:** `src/components/video/VideoGrid.tsx`

#### Video type

```ts
export type Video = {
  id: string;
  filename: string;
  // original_url now stores the stable storage key for the video object.
  // A fresh playback URL is generated on demand via the /api/videos/[id]/play endpoint.
  original_url: string;
  original_thumbnail_url: string;
  preview_thumbnail_data: string | null;
  processed_url: string | null;
  processed_thumbnail_url: string | null;
  status: "uploaded" | "processing" | "processed" | "failed";
  upload_date: string;
};
```

#### State and click handler

```ts
const [videoPlayer, setVideoPlayer] = useState<{
  isOpen: boolean;
  videoUrl: string | null;
}>({
  isOpen: false,
  videoUrl: null,
});

const [isOpeningVideo, setIsOpeningVideo] = useState<string | null>(null);

const handleVideoClick = async (video: Video) => {
  try {
    setIsOpeningVideo(video.id);

    const response = await fetch(`/api/videos/${video.id}/play`);
    const data = await response.json();

    if (!response.ok || !data.success || !data.data?.playbackUrl) {
      throw new Error(data.error?.message || "Failed to generate playback URL");
    }

    setVideoPlayer({
      isOpen: true,
      videoUrl: data.data.playbackUrl,
    });
  } catch (error) {
    console.error("Error opening video:", error);
    toast({
      title: "Unable to play video",
      description:
        error instanceof Error ? error.message : "There was a problem generating a playback URL. Please try again.",
      variant: "error",
    });
  } finally {
    setIsOpeningVideo(null);
  }
};
```

#### Thumbnail

```tsx
<div
  className="w-60 max-w-[240px] aspect-video relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
  onClick={() => handleVideoClick(video)}>
  {isOpeningVideo === video.id && (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
      <LoadingSpinner size="sm" />
    </div>
  )}
  {video.preview_thumbnail_data ? (
    <img
      src={video.preview_thumbnail_data}
      alt={`${video.filename} - Preview`}
      className="object-cover w-full h-full"
    />
  ) : video.original_thumbnail_url && !video.original_thumbnail_url.includes("placeholder-video-thumbnail") ? (
    <Image
      src={video.original_thumbnail_url}
      alt={`${video.filename} - Thumbnail`}
      className="object-cover"
      fill
      sizes="240px"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
      <span className="text-gray-400 text-xs">No preview</span>
    </div>
  )}
</div>
```

**File:** `src/components/video/VideoPlayer.tsx`

- Remains unchanged. It simply takes `videoUrl` and passes it to `<video src={videoUrl} />`.

---

## Checklist for Applying This Fix to Another Codebase

1. **Storage & Env Setup**

   - Ensure you have a client for S3/Wasabi with region, endpoint, and credentials.
   - Decide whether objects are public or private. If private, use **presigned URLs**.

2. **Database Schema**

   - Ensure the videos table stores **object key** (not URL). If you already have URLs, add a migration path to extract keys.

3. **Upload Flow**

   - After upload, verify object exists in storage.
   - Persist: user id, filename, filesize, content_type, **key**, and any thumbnails/metadata.

4. **Playback API**

   - Implement an endpoint like `GET /api/videos/[id]/play` which:
     - Authenticates user.
     - Confirms ownership of the video.
     - Resolves key from the stored column (and handles legacy URLs if needed).
     - Returns a **fresh presigned URL**.

5. **Frontend**

   - Make sure your video list component:
     - Treats the stored field (e.g. `original_url`) as **key**, not as a direct URL.
     - Calls the `/play` endpoint on click to get a one-time playback URL.
     - Opens the video player with that URL.

6. **Verification**
   - Clicking a thumbnail should:
     - Trigger `/api/videos/[id]/play`.
     - Return 200 with a presigned URL.
     - Play correctly in `<video>`.
   - Opening the presigned URL directly in a tab should stream or download the video, not show an XML error.

This pattern keeps your storage secure (private objects) while allowing your app to play videos via short-lived, per-request URLs derived from the stored key.
