import QRCode from "qrcode";
import {PutObjectCommand, GetObjectCommand} from "@aws-sdk/client-s3";
import {wasabiClient, WASABI_BUCKET} from "./wasabi";

function getAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_APP_URL;
  if (!fromEnv) {
    throw new Error("App base URL is not configured. Set NEXT_PUBLIC_SITE_URL or PUBLIC_APP_URL.");
  }
  return fromEnv.replace(/\/$/, "");
}

export function getUserPublicProfileUrl(numericUserId: number): string {
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/profile/${numericUserId}`;
}

export function getUserQrCodeKey(numericUserId: number): string {
  return `qr-codes/${numericUserId}.png`;
}

export async function generateAndUploadUserQrCode(numericUserId: number): Promise<string> {
  const qrContent = getUserPublicProfileUrl(numericUserId);
  const pngBuffer = await QRCode.toBuffer(qrContent, {type: "png", margin: 1, scale: 6});

  const key = getUserQrCodeKey(numericUserId);

  const putCommand = new PutObjectCommand({
    Bucket: WASABI_BUCKET,
    Key: key,
    Body: pngBuffer,
    ContentType: "image/png",
  });

  await wasabiClient.send(putCommand);

  return key;
}

export async function getUserQrCodeImage(numericUserId: number): Promise<Buffer | null> {
  const key = getUserQrCodeKey(numericUserId);

  try {
    const getCommand = new GetObjectCommand({
      Bucket: WASABI_BUCKET,
      Key: key,
    });

    const result = await wasabiClient.send(getCommand);
    const chunks: Buffer[] = [];

    const body = result.Body;
    if (!body) {
      return null;
    }

    // Node.js S3 client returns a streaming body that is AsyncIterable<Uint8Array>
    const stream = body as unknown as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  } catch (error) {
    console.error("Error fetching user QR code from Wasabi:", error);
    return null;
  }
}
