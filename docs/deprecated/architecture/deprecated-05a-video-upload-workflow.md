# SAVD App - Video Upload Workflow

## Overview

The video upload workflow in the SAVD App enables users to securely upload video files directly to Wasabi cloud storage using pre-signed URLs. This approach bypasses the Next.js server for file transfer, allowing for efficient handling of large video files while maintaining security and control.

## Upload Workflow Diagram

```
┌──────────┐     ┌───────────────┐     ┌───────────────┐     ┌──────────────┐
│          │  1  │               │  2  │               │  3  │              │
│  Client  │────▶│  Next.js API  │────▶│  Wasabi SDK   │────▶│  Pre-signed  │
│          │     │               │     │               │     │  URL         │
└──────────┘     └───────────────┘     └───────────────┘     └──────────────┘
     │                                                              │
     │                                                              │
     │                                                              ▼
     │                                                       ┌──────────────┐
     │                                                       │              │
     │                                                       │  Wasabi S3   │
     │                                                       │              │
     │                                                       └──────────────┘
     │                                                              ▲
     │                                                              │
     │                           4                                  │
     └──────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                                                              │
     │                       5. Confirm Upload                      │
     │                                                              │
     └──────────────┬───────────────────────────────────────────────┘
                    │
                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                                                              │
     │                    6. Generate Thumbnail                     │
     │                                                              │
     └──────────────┬───────────────────────────────────────────────┘
                    │
                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                                                              │
     │                  7. Save Video Metadata                      │
     │                                                              │
     └──────────────────────────────────────────────────────────────┘
```

1. Client requests a pre-signed URL from Next.js API
2. API uses Wasabi SDK to generate pre-signed URL
3. API returns pre-signed URL to client
4. Client uploads video directly to Wasabi
5. Client confirms upload completion to API
6. API triggers thumbnail generation
7. API saves video metadata to database

## Implementation Components

### 1. Frontend Upload Component

The frontend uses a drag-and-drop interface with progress tracking:

```typescript
// src/components/video/VideoUploader.tsx
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert } from '@/components/ui/alert';
import { UploadIcon } from 'lucide-react';

export function VideoUploader({ onUploadComplete }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const { uploadVideo, uploading, progress, error } = useVideoUpload();
  
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.webm']
    },
    maxSize: 500 * 1024 * 1024, // 500MB
    maxFiles: 1,
  });
  
  const handleUpload = async () => {
    if (!selectedFile) return;
    
    try {
      const result = await uploadVideo(selectedFile);
      setSelectedFile(null);
      onUploadComplete(result);
    } catch (err) {
      // Error handling is done in the hook
    }
  };
  
  return (
    <div className="space-y-4">
      {!selectedFile && !uploading && (
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
              or click to select a file (MP4, MOV, AVI, WEBM up to 500MB)
            </p>
          </div>
        </div>
      )}
      
      {selectedFile && !uploading && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            <Button onClick={handleUpload}>
              Upload Video
            </Button>
          </div>
        </div>
      )}
      
      {uploading && (
        <div className="border rounded-lg p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">Uploading...</p>
              <p className="text-sm font-medium">{progress}%</p>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
      )}
      
      {error && (
        <Alert variant="destructive">
          <p>{error.message || 'An error occurred during upload'}</p>
        </Alert>
      )}
    </div>
  );
}
```

### 2. Upload Hook

A custom hook manages the upload process and state:

```typescript
// src/hooks/useVideoUpload.ts
import { useState } from 'react';
import { useToast } from '@/hooks/useToast';

export function useVideoUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const uploadVideo = async (file) => {
    try {
      setUploading(true);
      setProgress(0);
      setError(null);

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
      
      const { uploadUrl, fields, key } = await getUrlResponse.json();
      
      // Step 2: Upload file directly to Wasabi
      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file);

      // Upload with progress tracking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setProgress(percentComplete);
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });
        
        xhr.open('POST', uploadUrl);
        xhr.send(formData);
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
      
      toast({
        title: 'Upload successful',
        description: `${file.name} has been uploaded.`,
        type: 'success',
      });
      
      return data;
    } catch (err) {
      setError(err);
      
      toast({
        title: 'Upload failed',
        description: err.message || 'An error occurred during upload',
        type: 'error',
      });
      
      throw err;
    } finally {
      setUploading(false);
    }
  };

  return {
    uploadVideo,
    uploading,
    progress,
    error,
  };
}
```

### 3. Pre-signed URL Generation API

The API endpoint generates pre-signed URLs for direct uploads:

```typescript
// src/app/api/videos/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { wasabiClient, WASABI_BUCKET } from '@/lib/wasabi';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
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
        { success: false, error: { code: 'validation_error', message: 'Missing required fields' } },
        { status: 400 }
      );
    }
    
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { success: false, error: { code: 'validation_error', message: 'Invalid file type' } },
        { status: 400 }
      );
    }
    
    // Validate file size
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (filesize > maxSize) {
      return NextResponse.json(
        { success: false, error: { code: 'validation_error', message: 'File too large' } },
        { status: 400 }
      );
    }
    
    // Generate a unique key for the file
    const userId = session.user.id;
    const timestamp = Date.now();
    const fileExtension = filename.split('.').pop();
    const key = `uploads/${userId}/${timestamp}-${uuidv4()}.${fileExtension}`;
    
    // Create presigned post URL
    const presignedPost = await createPresignedPost(wasabiClient, {
      Bucket: WASABI_BUCKET,
      Key: key,
      Fields: {
        'Content-Type': contentType,
      },
      Conditions: [
        ['content-length-range', 0, maxSize],
        ['starts-with', '$Content-Type', contentType.split('/')[0]],
      ],
      Expires: 3600, // 1 hour
    });
    
    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: presignedPost.url,
        fields: presignedPost.fields,
        key,
      }
    });
  } catch (error: any) {
    console.error('Error creating presigned URL:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Failed to create upload URL' } },
      { status: 500 }
    );
  }
}
```

### 4. Upload Confirmation API

The API endpoint confirms upload completion and triggers thumbnail generation:

```typescript
// src/app/api/videos/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { wasabiClient, WASABI_BUCKET } from '@/lib/wasabi';
import { generateThumbnail } from '@/lib/thumbnail';

export async function POST(request: NextRequest) {
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
        Bucket: WASABI_BUCKET,
        Key: key,
      });
      await wasabiClient.send(headCommand);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Uploaded file not found' } },
        { status: 404 }
      );
    }
    
    // Generate URLs for the video and thumbnail
    const videoUrl = `https://${WASABI_BUCKET}.s3.wasabisys.com/${key}`;
    
    // Generate thumbnail (in a real implementation, this would be a background job)
    const thumbnailKey = await generateThumbnail(key);
    const thumbnailUrl = `https://${WASABI_BUCKET}.s3.wasabisys.com/${thumbnailKey}`;
    
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
    
    return NextResponse.json({
      success: true,
      data: {
        id: video.id,
        filename: video.filename,
        originalUrl: video.original_url,
        originalThumbnailUrl: video.original_thumbnail_url,
      }
    });
  } catch (error: any) {
    console.error('Error confirming upload:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Failed to confirm upload' } },
      { status: 500 }
    );
  }
}
```

### 5. Thumbnail Generation

A utility function generates thumbnails for uploaded videos:

```typescript
// src/lib/thumbnail.ts
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { wasabiClient, WASABI_BUCKET } from '@/lib/wasabi';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

export async function generateThumbnail(videoKey: string): Promise<string> {
  try {
    // Create temporary file paths
    const tempDir = tmpdir();
    const videoPath = join(tempDir, `${uuidv4()}.mp4`);
    const thumbnailPath = join(tempDir, `${uuidv4()}.jpg`);
    
    // Download video from Wasabi
    const getCommand = new GetObjectCommand({
      Bucket: WASABI_BUCKET,
      Key: videoKey,
    });
    
    const { Body } = await wasabiClient.send(getCommand);
    
    if (!Body || !(Body instanceof Readable)) {
      throw new Error('Failed to get video stream');
    }
    
    // Save video to temporary file
    const chunks: Buffer[] = [];
    for await (const chunk of Body) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    await writeFile(videoPath, buffer);
    
    // Generate thumbnail using ffmpeg
    await new Promise<void>((resolve, reject) => {
      // Extract frame at 2 seconds
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-ss', '00:00:02',
        '-frames:v', '1',
        '-q:v', '2',
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
    const thumbnailKey = videoKey.replace(/\.[^/.]+$/, '') + '-thumbnail.jpg';
    
    // Upload thumbnail to Wasabi
    const thumbnailBuffer = await readFile(thumbnailPath);
    
    const putCommand = new PutObjectCommand({
      Bucket: WASABI_BUCKET,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg',
    });
    
    await wasabiClient.send(putCommand);
    
    // Clean up temporary files
    await unlink(videoPath);
    await unlink(thumbnailPath);
    
    return thumbnailKey;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    
    // Return a default thumbnail key if generation fails
    return 'defaults/video-thumbnail.jpg';
  }
}
```

## Error Handling & Recovery

### Upload Error Handling

1. **Pre-signed URL Generation Errors**:
   - Network errors: Retry with exponential backoff
   - Authentication errors: Redirect to login
   - Validation errors: Display specific error messages

2. **File Upload Errors**:
   - Network interruptions: Implement retry mechanism
   - S3 errors: Parse and display meaningful error messages
   - Timeout errors: Implement configurable timeout with extension

3. **Confirmation Errors**:
   - Database errors: Retry with exponential backoff
   - File not found: Suggest re-uploading
   - Thumbnail generation errors: Use default thumbnail

### Recovery Mechanisms

1. **Chunked Uploads**:
   - For future enhancement, implement chunked uploads for large files
   - Allow resuming interrupted uploads from last successful chunk

2. **Upload Verification**:
   - Verify file integrity after upload using checksums
   - Implement automatic retry for failed uploads

3. **Cleanup Process**:
   - Implement background job to clean up orphaned files
   - Remove temporary files after processing

## Performance Considerations

1. **Client-Side Optimization**:
   - Compress videos before upload when possible
   - Implement client-side validation for early feedback
   - Display clear progress indicators

2. **Server-Side Optimization**:
   - Use streaming for thumbnail generation
   - Implement background processing for non-blocking operations
   - Cache pre-signed URLs for similar requests

3. **Storage Optimization**:
   - Implement lifecycle policies for temporary files
   - Consider transcoding videos to optimize storage

## Security Measures

1. **Upload Security**:
   - Validate file types and sizes before generating pre-signed URLs
   - Implement strict CORS policies on S3 bucket
   - Use short-lived pre-signed URLs (1 hour maximum)

2. **Content Security**:
   - Scan uploaded videos for malware (future enhancement)
   - Implement rate limiting for upload endpoints
   - Store files with user-specific prefixes for isolation

3. **Access Control**:
   - Ensure Row-Level Security for video metadata
   - Implement proper IAM policies for Wasabi access
   - Use secure, randomized file paths

## Implementation Guidelines

1. **Frontend Implementation**:
   - Use React Dropzone for drag-and-drop functionality
   - Implement proper validation and error handling
   - Show clear progress indicators and status messages

2. **API Implementation**:
   - Validate all inputs thoroughly
   - Implement proper authentication and authorization
   - Use structured error responses

3. **Storage Implementation**:
   - Configure Wasabi bucket with proper permissions
   - Implement organized folder structure
   - Set up CORS configuration for direct uploads
