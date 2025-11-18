import {GetObjectCommand} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {wasabiClient, WASABI_BUCKET} from "./wasabi";

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
