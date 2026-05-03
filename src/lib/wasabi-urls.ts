import {GetObjectCommand} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {wasabiClient, WASABI_BUCKET} from "./wasabi";

/**
 * Resolve a profile photo value to a usable URL:
 *  - Bare S3 key (e.g. "avatars/…")  → presigned GET URL
 *  - Old Wasabi public URL (https://*.wasabisys.com/…) → extract key → presigned GET URL
 *  - Any other https URL (LinkedIn, Google…) → return as-is
 *  - null/undefined → null
 */
export async function resolvePhotoUrl(
  photo: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!photo) return null;

  // Bare S3 key stored by the new upload flow
  if (!photo.startsWith("http://") && !photo.startsWith("https://")) {
    return generatePresignedVideoUrl(photo, expiresIn);
  }

  // Old Wasabi public URLs (bucket may have public access blocked)
  if (photo.includes("wasabisys.com")) {
    const key = extractKeyFromUrl(photo);
    if (key) return generatePresignedVideoUrl(key, expiresIn);
  }

  return photo;
}

export async function generatePresignedVideoUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: WASABI_BUCKET,
    Key: key,
  });

  try {
    const presignedUrl = await getSignedUrl(wasabiClient, command, {
      expiresIn,
    });
    return presignedUrl;
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw new Error("Failed to generate video access URL");
  }
}

export function generatePublicVideoUrl(key: string): string {
  const endpoint = process.env.WASABI_ENDPOINT?.replace("https://", "") || "s3.wasabisys.com";
  const url = `https://${WASABI_BUCKET}.${endpoint}/${key}`;

  console.log("generatePublicVideoUrl:", {
    key,
    endpoint_env: process.env.WASABI_ENDPOINT,
    endpoint_used: endpoint,
    bucket: WASABI_BUCKET,
    generated_url: url,
  });

  return url;
}

export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1);
  } catch {
    return null;
  }
}
