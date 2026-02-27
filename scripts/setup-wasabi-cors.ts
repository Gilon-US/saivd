/**
 * Sets CORS policy on the Wasabi S3 bucket to allow cross-origin video
 * playback and canvas-based frame analysis from the frontend.
 *
 * Usage:
 *   npx tsx scripts/setup-wasabi-cors.ts
 *
 * Reads Wasabi credentials from .env.local (same vars the app uses).
 */

import {S3Client, PutBucketCorsCommand, GetBucketCorsCommand} from "@aws-sdk/client-s3";
import {readFileSync} from "fs";
import {resolve} from "path";

function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    let value = trimmed.slice(eqIdx + 1);
    // Strip inline comments (unquoted # and everything after)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const hashIdx = value.indexOf("#");
      if (hashIdx !== -1) value = value.slice(0, hashIdx);
    }
    value = value.trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const region = process.env.WASABI_REGION!;
const endpoint = process.env.WASABI_ENDPOINT!;
const bucket = process.env.WASABI_BUCKET_NAME!;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!region || !endpoint || !bucket) {
  console.error("Missing WASABI_REGION, WASABI_ENDPOINT, or WASABI_BUCKET_NAME in .env.local");
  process.exit(1);
}

const client = new S3Client({
  region,
  endpoint,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const allowedOrigins = [
  appUrl.replace(/\/$/, ""),
  "http://localhost:3000",
  "http://localhost:3001",
];
// Deduplicate
const uniqueOrigins = [...new Set(allowedOrigins)];

async function main() {
  console.log(`\nSetting CORS on bucket: ${bucket}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Allowed origins: ${uniqueOrigins.join(", ")}\n`);

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: uniqueOrigins,
            AllowedMethods: ["GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["Content-Length", "Content-Type", "ETag"],
            MaxAgeSeconds: 3600,
          },
          {
            AllowedOrigins: uniqueOrigins,
            AllowedMethods: ["PUT", "POST"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );

  console.log("CORS policy applied successfully.\n");

  const result = await client.send(new GetBucketCorsCommand({Bucket: bucket}));
  console.log("Current CORS rules:");
  console.log(JSON.stringify(result.CORSRules, null, 2));
}

main().catch((err) => {
  console.error("Failed to set CORS:", err);
  process.exit(1);
});
