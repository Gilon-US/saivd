# Video Upload Implementation Guide

This guide covers the implementation of video upload functionality in the SAVD App using Wasabi cloud storage.

## Overview

The SAVD App allows users to upload video files directly to Wasabi storage using pre-signed URLs. This approach enables secure, efficient uploads without passing large files through the application server. This guide explains how to implement the video upload flow, including frontend components and backend API routes.

## Prerequisites

- Wasabi account with an S3 bucket configured
- AWS SDK installed (`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`)
- Next.js project with API routes
- Supabase project for storing video metadata

## Implementation Steps

### 1. Set Up Wasabi Client

Create a utility file to initialize the Wasabi S3 client:

```typescript
// src/lib/wasabi.ts
import { S3Client } from '@aws-sdk/client-s3';

export const wasabiClient = new S3Client({
  region: process.env.WASABI_REGION!,
  endpoint: process.env.WASABI_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
});

export const WASABI_BUCKET_NAME = process.env.WASABI_BUCKET_NAME!;
```

### 2. Create Pre-signed URL Generation API

Implement an API route to generate pre-signed URLs for video uploads:

```typescript
// src/app/api/videos/upload/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { wasabiClient, WASABI_BUCKET_NAME } from '@/lib/wasabi';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    // Parse request body
    const { filename, contentType, filesize } = await request.json();
    
    // Validate input
    if (!filename || !contentType || !filesize) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'validation_error', 
            message: 'Missing required fields',
            details: {
              filename: !filename ? 'Filename is required' : undefined,
              contentType: !contentType ? 'Content type is required' : undefined,
              filesize: !filesize ? 'File size is required' : undefined,
            }
          } 
        },
        { status: 400 }
      );
    }
    
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'validation_error', 
            message: 'Invalid file type',
            details: {
              contentType: `File type ${contentType} is not supported. Supported types: ${allowedTypes.join(', ')}`
            }
          } 
        },
        { status: 400 }
      );
    }
    
    // Validate file size
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (filesize > maxSize) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'validation_error', 
            message: 'File too large',
            details: {
              filesize: `File size exceeds the maximum allowed size of 500MB`
            }
          } 
        },
        { status: 400 }
      );
    }
    
    // Generate a unique key for the file
    const userId = session.user.id;
    const timestamp = Date.now();
    const fileExtension = filename.split('.').pop();
    const key = `uploads/${userId}/${timestamp}-${uuidv4()}.${fileExtension}`;
    
    // Create the command to put an object in the bucket
    const command = new PutObjectCommand({
      Bucket: WASABI_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });
    
    // Generate pre-signed URL (valid for 10 minutes)
    const uploadUrl = await getSignedUrl(wasabiClient, command, { expiresIn: 600 });
    
    return NextResponse.json({
      success: true,
      data: {
        uploadUrl,
        key,
      }
    });
  } catch (error: any) {
    console.error('Error generating pre-signed URL:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'server_error', 
          message: 'Failed to generate upload URL',
          reference: uuidv4() // For server-side logging reference
        } 
      },
      { status: 500 }
    );
  }
}
```

### 3. Create Upload Confirmation API

Implement an API route to confirm upload completion and store video metadata:

```typescript
// src/app/api/videos/confirm/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { wasabiClient, WASABI_BUCKET_NAME } from '@/lib/wasabi';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    // Parse request body
    const { key, filename, filesize, contentType } = await request.json();
    
    // Validate input
    if (!key || !filename || !filesize || !contentType) {
      return NextResponse.json(
        { success: false, error: { code: 'validation_error', message: 'Missing required fields' } },
        { status: 400 }
      );
    }
    
    // Verify the file exists in Wasabi
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: WASABI_BUCKET_NAME,
        Key: key,
      });
      await wasabiClient.send(headCommand);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Uploaded file not found' } },
        { status: 404 }
      );
    }
    
    // Generate thumbnail key
    const thumbnailKey = key.replace(/\.[^/.]+$/, '') + '-thumbnail.jpg';
    
    // Generate URLs for the video and thumbnail
    const videoUrl = `https://${WASABI_BUCKET_NAME}.s3.${process.env.WASABI_REGION}.wasabisys.com/${key}`;
    const thumbnailUrl = `https://${WASABI_BUCKET_NAME}.s3.${process.env.WASABI_REGION}.wasabisys.com/${thumbnailKey}`;
    
    // Generate a pre-signed URL for video access (valid for 1 hour)
    const getCommand = new GetObjectCommand({
      Bucket: WASABI_BUCKET_NAME,
      Key: key,
    });
    const signedUrl = await getSignedUrl(wasabiClient, getCommand, { expiresIn: 3600 });
    
    // Store video metadata in Supabase
    const { data: video, error } = await supabase
      .from('videos')
      .insert({
        user_id: session.user.id,
        filename,
        filesize,
        content_type: contentType,
        original_url: videoUrl,
        original_thumbnail_url: thumbnailUrl,
        upload_date: new Date().toISOString(),
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error storing video metadata:', error);
      return NextResponse.json(
        { success: false, error: { code: 'database_error', message: 'Failed to store video metadata' } },
        { status: 500 }
      );
    }
    
    // Trigger thumbnail generation (this would typically be a separate service or function)
    // For now, we'll assume thumbnails are generated asynchronously
    
    return NextResponse.json({
      success: true,
      data: {
        id: video.id,
        filename: video.filename,
        originalUrl: signedUrl, // Return the signed URL for immediate access
        originalThumbnailUrl: video.original_thumbnail_url,
      }
    });
  } catch (error: any) {
    console.error('Error confirming upload:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'server_error', 
          message: 'Failed to confirm upload',
          reference: uuidv4() // For server-side logging reference
        } 
      },
      { status: 500 }
    );
  }
}
```

### 4. Create Video Upload Hook

Implement a custom hook for handling video uploads:

```typescript
// src/hooks/useVideoUpload.ts
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

type UploadState = {
  progress: number;
  uploading: boolean;
  error: Error | null;
  videoId: string | null;
};

type UploadResult = {
  id: string;
  filename: string;
  originalUrl: string;
  originalThumbnailUrl: string;
};

export function useVideoUpload() {
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});

  const uploadVideo = async (file: File): Promise<UploadResult> => {
    const uploadId = uuidv4();
    
    // Initialize upload state
    setUploadState((prev) => ({
      ...prev,
      [uploadId]: {
        progress: 0,
        uploading: true,
        error: null,
        videoId: null,
      },
    }));
    
    try {
      // Step 1: Get pre-signed URL
      const getUrlResponse = await fetch('/api/videos/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          filesize: file.size,
        }),
      });
      
      if (!getUrlResponse.ok) {
        const errorData = await getUrlResponse.json();
        throw new Error(errorData.error?.message || 'Failed to get upload URL');
      }
      
      const { data: { uploadUrl, key } } = await getUrlResponse.json();
      
      // Step 2: Upload file directly to Wasabi
      const uploadResponse = await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadState((prev) => ({
              ...prev,
              [uploadId]: {
                ...prev[uploadId],
                progress,
              },
            }));
          }
        });
        
        // Handle completion
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });
        
        // Handle errors
        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });
        
        xhr.addEventListener('abort', () => {
          reject(new Error('Upload aborted'));
        });
        
        // Send the request
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
      
      // Step 3: Confirm upload
      const confirmResponse = await fetch('/api/videos/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          filename: file.name,
          filesize: file.size,
          contentType: file.type,
        }),
      });
      
      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        throw new Error(errorData.error?.message || 'Failed to confirm upload');
      }
      
      const { data } = await confirmResponse.json();
      
      // Update state with success
      setUploadState((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          uploading: false,
          progress: 100,
          videoId: data.id,
        },
      }));
      
      return data;
    } catch (error: any) {
      // Update state with error
      setUploadState((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          uploading: false,
          error,
        },
      }));
      
      throw error;
    }
  };

  const getUploadState = (uploadId: string): UploadState | undefined => {
    return uploadState[uploadId];
  };

  const clearUploadState = (uploadId: string) => {
    setUploadState((prev) => {
      const newState = { ...prev };
      delete newState[uploadId];
      return newState;
    });
  };

  return {
    uploadVideo,
    getUploadState,
    clearUploadState,
    uploadState,
  };
}
```

### 5. Create Video Uploader Component

Implement a drag-and-drop video uploader component:

```typescript
// src/components/video/VideoUploader.tsx
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UploadIcon, XIcon } from 'lucide-react';

type VideoUploaderProps = {
  onUploadComplete: (videoData: any) => void;
  maxFileSize?: number;
};

export function VideoUploader({ 
  onUploadComplete, 
  maxFileSize = 500 * 1024 * 1024 // 500MB default
}: VideoUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { uploadVideo, uploadState } = useVideoUpload();
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Reset states
    setError(null);
    
    // Validate files
    if (acceptedFiles.length === 0) {
      return;
    }
    
    const file = acceptedFiles[0];
    
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
      setError(`File type ${file.type} is not supported. Please upload a video file (MP4, MOV, AVI, WEBM).`);
      return;
    }
    
    // Validate file size
    if (file.size > maxFileSize) {
      setError(`File size exceeds the maximum allowed size of ${maxFileSize / (1024 * 1024)}MB.`);
      return;
    }
    
    setSelectedFile(file);
  }, [maxFileSize]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.webm']
    },
    maxFiles: 1,
  });
  
  const handleUpload = async () => {
    if (!selectedFile) return;
    
    try {
      setError(null);
      const uploadResult = await uploadVideo(selectedFile);
      onUploadComplete(uploadResult);
      setSelectedFile(null);
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
    }
  };
  
  const handleCancel = () => {
    setSelectedFile(null);
    setError(null);
  };
  
  const currentUpload = uploadId ? uploadState[uploadId] : null;
  
  return (
    <div className="space-y-4">
      {!selectedFile && !currentUpload?.uploading && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-primary/50'
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center space-y-2">
            <UploadIcon className="h-10 w-10 text-gray-400" />
            <p className="text-lg font-medium">
              {isDragActive ? 'Drop the video here' : 'Drag & drop a video file here'}
            </p>
            <p className="text-sm text-gray-500">
              or click to select a file (MP4, MOV, AVI, WEBM up to {maxFileSize / (1024 * 1024)}MB)
            </p>
          </div>
        </div>
      )}
      
      {selectedFile && !currentUpload?.uploading && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="bg-primary/10 p-2 rounded-md">
                <UploadIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleCancel}>
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="mt-4 flex justify-end space-x-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleUpload}>
              Upload Video
            </Button>
          </div>
        </div>
      )}
      
      {currentUpload?.uploading && (
        <div className="border rounded-lg p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">Uploading...</p>
              <p className="text-sm font-medium">{currentUpload.progress}%</p>
            </div>
            <Progress value={currentUpload.progress} className="h-2" />
          </div>
        </div>
      )}
      
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

### 6. Create Video Upload Page

Implement a page for video uploads:

```typescript
// src/app/dashboard/upload/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VideoUploader } from '@/components/video/VideoUploader';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon } from 'lucide-react';

export default function UploadPage() {
  const [uploadComplete, setUploadComplete] = useState(false);
  const router = useRouter();
  
  const handleUploadComplete = (videoData: any) => {
    setUploadComplete(true);
    // Optionally, you could redirect to the video details page
    // router.push(`/dashboard/videos/${videoData.id}`);
  };
  
  const handleViewVideos = () => {
    router.push('/dashboard/videos');
  };
  
  const handleUploadAnother = () => {
    setUploadComplete(false);
  };
  
  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeftIcon className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold ml-2">Upload Video</h1>
      </div>
      
      {!uploadComplete ? (
        <div className="bg-white rounded-lg shadow p-6">
          <VideoUploader onUploadComplete={handleUploadComplete} />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-green-600 mb-2">Upload Complete!</h2>
            <p className="text-gray-600">
              Your video has been successfully uploaded. You can now view it in your video library.
            </p>
          </div>
          <div className="flex justify-center space-x-4">
            <Button variant="outline" onClick={handleUploadAnother}>
              Upload Another Video
            </Button>
            <Button onClick={handleViewVideos}>
              View My Videos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 7. Implement Thumbnail Generation

For thumbnail generation, you'll need a separate service or function. Here's a simplified example using FFmpeg (in a real implementation, this would typically be a serverless function or background job):

```typescript
// This is a simplified example and would typically be implemented as a separate service
import { spawn } from 'child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const wasabiClient = new S3Client({
  region: process.env.WASABI_REGION!,
  endpoint: process.env.WASABI_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
});

const WASABI_BUCKET_NAME = process.env.WASABI_BUCKET_NAME!;

export async function generateThumbnail(videoUrl: string, key: string): Promise<string> {
  // Create a temporary directory
  const tempDir = path.join('/tmp', uuidv4());
  fs.mkdirSync(tempDir, { recursive: true });
  
  // Download video file (in a real implementation, you might stream directly)
  const videoPath = path.join(tempDir, 'video.mp4');
  const thumbnailPath = path.join(tempDir, 'thumbnail.jpg');
  
  // Use FFmpeg to generate thumbnail (at 5 seconds into the video)
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoUrl,
      '-ss', '00:00:05',
      '-vframes', '1',
      '-vf', 'scale=320:-1',
      thumbnailPath
    ]);
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg process exited with code ${code}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
  
  // Generate thumbnail key
  const thumbnailKey = key.replace(/\.[^/.]+$/, '') + '-thumbnail.jpg';
  
  // Upload thumbnail to Wasabi
  const fileContent = fs.readFileSync(thumbnailPath);
  
  const command = new PutObjectCommand({
    Bucket: WASABI_BUCKET_NAME,
    Key: thumbnailKey,
    Body: fileContent,
    ContentType: 'image/jpeg',
  });
  
  await wasabiClient.send(command);
  
  // Clean up temporary files
  fs.unlinkSync(videoPath);
  fs.unlinkSync(thumbnailPath);
  fs.rmdirSync(tempDir);
  
  // Return the thumbnail URL
  return `https://${WASABI_BUCKET_NAME}.s3.${process.env.WASABI_REGION}.wasabisys.com/${thumbnailKey}`;
}
```

## Testing Video Upload

To test the video upload implementation:

1. Prepare a test video file (MP4, MOV, AVI, or WEBM format)
2. Navigate to the upload page and drag the file into the uploader
3. Verify that the progress bar updates during upload
4. Check that the video appears in the video list after upload
5. Verify that the thumbnail is generated correctly

## Common Issues and Solutions

### Issue: Upload fails with CORS errors

**Solution**: Ensure that CORS is properly configured on your Wasabi bucket to allow uploads from your application domain.

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-domain.com", "http://localhost:3000"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

### Issue: Large video uploads time out

**Solution**: Implement chunked uploads for large files using the multipart upload API. This breaks the file into smaller pieces that are uploaded in parallel.

### Issue: Thumbnails are not generated

**Solution**: Check that your thumbnail generation service is properly configured and has access to the video files. Ensure that FFmpeg is installed and available in the environment where the service runs.

## Next Steps

After implementing basic video upload functionality, consider adding:

1. Chunked uploads for large files
2. Upload resume capability
3. Multiple file selection
4. Video transcoding to different formats
5. Advanced thumbnail options (multiple thumbnails, custom thumbnail selection)
6. Video metadata extraction (duration, resolution, etc.)

These features can enhance the user experience and provide more robust video handling capabilities.
