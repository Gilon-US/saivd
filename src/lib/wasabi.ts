import { S3Client } from '@aws-sdk/client-s3';

/**
 * Wasabi S3-compatible client configuration
 * 
 * This client is used to generate pre-signed URLs for direct uploads to Wasabi storage.
 * Environment variables must be set in .env.local:
 * - WASABI_REGION: The Wasabi region (e.g., 'us-east-1')
 * - WASABI_ENDPOINT: The Wasabi endpoint URL (e.g., 'https://s3.us-east-1.wasabisys.com')
 * - WASABI_ACCESS_KEY_ID: Your Wasabi access key
 * - WASABI_SECRET_ACCESS_KEY: Your Wasabi secret key
 * - WASABI_BUCKET_NAME: Your Wasabi bucket name
 */
// Log Wasabi configuration for debugging (without secrets)
console.log('Wasabi Configuration:', {
  region: process.env.WASABI_REGION,
  endpoint: process.env.WASABI_ENDPOINT,
  bucket: process.env.WASABI_BUCKET_NAME,
  hasAccessKey: !!process.env.WASABI_ACCESS_KEY_ID,
  hasSecretKey: !!process.env.WASABI_SECRET_ACCESS_KEY,
});

// Validate required environment variables
if (!process.env.WASABI_REGION || 
    !process.env.WASABI_ENDPOINT || 
    !process.env.WASABI_ACCESS_KEY_ID || 
    !process.env.WASABI_SECRET_ACCESS_KEY || 
    !process.env.WASABI_BUCKET_NAME) {
  console.error('Missing required Wasabi environment variables');
}

export const wasabiClient = new S3Client({
  region: process.env.WASABI_REGION!,
  endpoint: process.env.WASABI_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for Wasabi
});

// Export the bucket name for use in other modules
export const WASABI_BUCKET = process.env.WASABI_BUCKET_NAME!;

// Constants for file upload limits
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
export const URL_EXPIRATION_SECONDS = 3600; // 1 hour