# SAVD App - Backend API Architecture

## Overview

The backend API for the SAVD App is built using Next.js API routes with TypeScript. It provides endpoints for authentication, video management, watermarking integration, and public sharing. The API follows RESTful principles and implements proper error handling, validation, and security measures.

## API Structure

```
src/app/api/
├── auth/                       # Authentication endpoints
│   ├── login/route.ts          # User login
│   ├── register/route.ts       # User registration
│   ├── logout/route.ts         # User logout
│   └── user/route.ts           # Get current user
│
├── videos/                     # Video management endpoints
│   ├── route.ts                # List videos (GET) / Create video (POST)
│   ├── upload/route.ts         # Get pre-signed URL for upload
│   ├── confirm/route.ts        # Confirm upload completion
│   ├── [id]/                   # Video-specific operations
│   │   ├── route.ts            # Get video (GET) / Update video (PUT) / Delete video (DELETE)
│   │   ├── watermark/          # Watermarking operations
│   │   │   ├── route.ts        # Request watermarking (POST) / Delete watermarked version (DELETE)
│   │   │   └── status/route.ts # Check watermarking status (GET)
│   │   └── public-url/route.ts # Generate public URL (POST) / Revoke public URL (DELETE)
│
├── callbacks/                  # External service callbacks
│   └── watermark/route.ts      # Watermarking service callback
│
└── health/route.ts             # Health check endpoint
```

## Authentication & Authorization

### Authentication Flow

1. **User Registration**:
   - Client submits email and password
   - Server creates user in Supabase Auth
   - Supabase trigger creates user profile

2. **User Login**:
   - Client submits credentials
   - Server authenticates with Supabase
   - JWT token returned to client

3. **Authorization**:
   - JWT token included in API requests
   - Token verified by middleware
   - Row-level security enforced in database

### Authentication Middleware

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  
  // Check if user is authenticated
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Protected API routes pattern
  const isProtectedApiRoute = req.nextUrl.pathname.startsWith('/api/') && 
    !req.nextUrl.pathname.startsWith('/api/health') &&
    !req.nextUrl.pathname.startsWith('/api/auth') &&
    !req.nextUrl.pathname.startsWith('/api/callbacks');

  // Redirect if accessing protected route without authentication
  if (isProtectedApiRoute && !session) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};
```

## API Endpoints Implementation

### Video Upload Flow

1. **Request Pre-signed URL**:

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

2. **Confirm Upload Completion**:

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
    const videoUrl = `https://${WASABI_BUCKET}.s3.${process.env.WASABI_REGION}.wasabisys.com/${key}`;
    
    // Generate thumbnail (in a real implementation, this would be a background job)
    const thumbnailKey = await generateThumbnail(key);
    const thumbnailUrl = `https://${WASABI_BUCKET}.s3.${process.env.WASABI_REGION}.wasabisys.com/${thumbnailKey}`;
    
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

### Watermarking Flow

1. **Request Watermarking**:

```typescript
// src/app/api/videos/[id]/watermark/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requestWatermarking } from '@/lib/watermark';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const videoId = params.id;
    
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    // Get video details
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', session.user.id)
      .single();
      
    if (videoError || !video) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Video not found' } },
        { status: 404 }
      );
    }
    
    // Parse request body for options (optional)
    const { options } = await request.json().catch(() => ({ options: undefined }));
    
    // Generate callback URL with token
    const callbackToken = uuidv4();
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/callbacks/watermark?token=${callbackToken}`;
    
    // Create watermarked video record (pending)
    const { data: watermarkedVideo, error: watermarkedError } = await supabase
      .from('watermarked_videos')
      .insert({
        video_id: videoId,
        user_id: session.user.id,
        status: 'processing',
      })
      .select()
      .single();
      
    if (watermarkedError) {
      return NextResponse.json(
        { success: false, error: { code: 'database_error', message: 'Failed to create watermarked video record' } },
        { status: 500 }
      );
    }
    
    // Request watermarking from external service
    const watermarkResult = await requestWatermarking(
      video.original_url,
      callbackUrl,
      options
    );
    
    // Create watermarking job record
    const { error: jobError } = await supabase
      .from('watermarking_jobs')
      .insert({
        video_id: videoId,
        watermarked_video_id: watermarkedVideo.id,
        user_id: session.user.id,
        external_job_id: watermarkResult.jobId,
        status: 'processing',
        request_payload: { options },
        callback_token: callbackToken,
      });
      
    if (jobError) {
      return NextResponse.json(
        { success: false, error: { code: 'database_error', message: 'Failed to create watermarking job record' } },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        id: watermarkedVideo.id,
        status: 'processing',
        estimatedProcessingTime: watermarkResult.estimatedProcessingTime,
      }
    });
  } catch (error: any) {
    console.error('Error requesting watermarking:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Failed to request watermarking' } },
      { status: 500 }
    );
  }
}
```

2. **Watermarking Callback**:

```typescript
// src/app/api/callbacks/watermark/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Direct Supabase client (not using cookies since this is a server-to-server call)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Get callback token from URL
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Missing callback token' } },
        { status: 401 }
      );
    }
    
    // Verify token and get job
    const { data: job, error: jobError } = await supabase
      .from('watermarking_jobs')
      .select('*')
      .eq('callback_token', token)
      .single();
      
    if (jobError || !job) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Invalid callback token' } },
        { status: 404 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    const { 
      jobId, 
      status, 
      videoUrl, 
      thumbnailUrl, 
      error: errorMessage 
    } = body;
    
    // Validate job ID
    if (jobId !== job.external_job_id) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_job', message: 'Job ID mismatch' } },
        { status: 400 }
      );
    }
    
    // Update job record
    await supabase
      .from('watermarking_jobs')
      .update({
        status,
        response_payload: body,
        callback_received: true,
        callback_timestamp: new Date().toISOString(),
        error_message: errorMessage || null,
      })
      .eq('id', job.id);
      
    // Update watermarked video record
    if (status === 'completed' && videoUrl) {
      await supabase
        .from('watermarked_videos')
        .update({
          watermarked_url: videoUrl,
          watermarked_thumbnail_url: thumbnailUrl,
          status: 'completed',
          watermark_date: new Date().toISOString(),
        })
        .eq('id', job.watermarked_video_id);
    } else if (status === 'error') {
      await supabase
        .from('watermarked_videos')
        .update({
          status: 'error',
          error_message: errorMessage || 'Unknown error',
        })
        .eq('id', job.watermarked_video_id);
    }
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Callback processed successfully'
      }
    });
  } catch (error: any) {
    console.error('Error processing watermarking callback:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Failed to process watermarking callback' } },
      { status: 500 }
    );
  }
}
```

### Public Sharing Flow

```typescript
// src/app/api/videos/[id]/public-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const videoId = params.id;
    
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    // Get video and watermarked version
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*, watermarked_videos(*)')
      .eq('id', videoId)
      .eq('user_id', session.user.id)
      .single();
      
    if (videoError || !video) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Video not found' } },
        { status: 404 }
      );
    }
    
    // Check if watermarked version exists and is completed
    if (!video.watermarked_videos || video.watermarked_videos.length === 0 || 
        video.watermarked_videos[0].status !== 'completed') {
      return NextResponse.json(
        { success: false, error: { code: 'precondition_failed', message: 'Watermarked version not available' } },
        { status: 412 }
      );
    }
    
    const watermarkedVideo = video.watermarked_videos[0];
    
    // Parse request body for expiration (optional)
    const { expiresIn } = await request.json().catch(() => ({ expiresIn: undefined }));
    
    // Calculate expiration date (default: 30 days)
    const expiresInSeconds = expiresIn || 30 * 24 * 60 * 60; // 30 days in seconds
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresInSeconds);
    
    // Generate a secure token
    const token = nanoid(16); // Short but secure token for URLs
    
    // Create public access token
    const { data: accessToken, error: tokenError } = await supabase
      .from('public_access_tokens')
      .insert({
        watermarked_video_id: watermarkedVideo.id,
        user_id: session.user.id,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();
      
    if (tokenError) {
      return NextResponse.json(
        { success: false, error: { code: 'database_error', message: 'Failed to create public access token' } },
        { status: 500 }
      );
    }
    
    // Generate public URL
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/watch/${token}`;
    
    return NextResponse.json({
      success: true,
      data: {
        token,
        publicUrl,
        expiresAt: expiresAt.toISOString(),
      }
    });
  } catch (error: any) {
    console.error('Error generating public URL:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Failed to generate public URL' } },
      { status: 500 }
    );
  }
}
```

## Error Handling Strategy

The API implements a consistent error handling approach:

1. **Structured Error Responses**:
   ```typescript
   {
     success: false,
     error: {
       code: 'error_code',
       message: 'Human-readable error message',
       details: { ... } // Optional additional details
     }
   }
   ```

2. **Error Codes**:
   - `unauthorized`: Authentication required or token invalid
   - `forbidden`: User doesn't have permission for the requested resource
   - `not_found`: Requested resource not found
   - `validation_error`: Request validation failed
   - `database_error`: Database operation failed
   - `service_error`: External service error
   - `server_error`: Internal server error

3. **Error Logging**:
   - Structured logging for all errors
   - Stack traces for server errors
   - Error context for debugging

## API Security Measures

1. **Authentication**:
   - JWT token validation
   - Session management with Supabase
   - Protected routes with middleware

2. **Authorization**:
   - Row-level security in database
   - User-specific resource access
   - Role-based permissions

3. **Input Validation**:
   - Request body validation
   - Parameter sanitization
   - Type checking with TypeScript

4. **API Protection**:
   - Rate limiting
   - CORS configuration
   - Security headers

## External Service Integration

### Watermarking Service Client

```typescript
// src/lib/watermark.ts
import axios from 'axios';

const watermarkApiClient = axios.create({
  baseURL: process.env.WATERMARK_SERVICE_URL,
  headers: {
    'Authorization': `Bearer ${process.env.WATERMARK_SERVICE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 seconds
});

export async function requestWatermarking(videoUrl: string, callbackUrl: string, options?: any) {
  try {
    const response = await watermarkApiClient.post('/watermark', {
      videoUrl,
      callbackUrl,
      options: options || {
        position: 'center',
        opacity: 0.5,
      },
    });
    
    return {
      jobId: response.data.jobId,
      estimatedProcessingTime: response.data.estimatedProcessingTime,
    };
  } catch (error: any) {
    // Implement retry logic for transient errors
    if (error.response?.status >= 500 || error.code === 'ECONNABORTED') {
      // Retry logic would go here
      console.error('Transient error requesting watermarking, retrying:', error);
      throw new Error('Watermarking service temporarily unavailable');
    }
    
    console.error('Error requesting watermarking:', error);
    throw new Error(error.response?.data?.message || 'Failed to request watermarking');
  }
}

export async function checkWatermarkingStatus(jobId: string) {
  try {
    const response = await watermarkApiClient.get(`/status/${jobId}`);
    
    return {
      status: response.data.status,
      progress: response.data.progress,
      result: response.data.result,
    };
  } catch (error: any) {
    console.error('Error checking watermarking status:', error);
    throw new Error(error.response?.data?.message || 'Failed to check watermarking status');
  }
}
```

## API Documentation

The API is documented using OpenAPI specification. Key endpoints include:

1. **Authentication Endpoints**:
   - `POST /api/auth/login`: Login with email/password
   - `POST /api/auth/register`: Register new user
   - `POST /api/auth/logout`: Logout current user
   - `GET /api/auth/user`: Get current user info

2. **Video Management Endpoints**:
   - `GET /api/videos`: List all videos for current user
   - `POST /api/videos/upload`: Get pre-signed URL for upload
   - `POST /api/videos/confirm`: Confirm upload completion
   - `GET /api/videos/:id`: Get video details
   - `DELETE /api/videos/:id`: Delete a video

3. **Watermarking Endpoints**:
   - `POST /api/videos/:id/watermark`: Request watermarking
   - `GET /api/videos/:id/watermark/status`: Check watermarking status
   - `DELETE /api/videos/:id/watermark`: Delete watermarked version

4. **Public Sharing Endpoints**:
   - `POST /api/videos/:id/public-url`: Generate public URL
   - `DELETE /api/videos/:id/public-url`: Revoke public access

5. **Callback Endpoints**:
   - `POST /api/callbacks/watermark`: Watermarking service callback

## Implementation Guidelines

1. **API Development**:
   - Follow RESTful principles
   - Implement proper validation
   - Use TypeScript for type safety

2. **Error Handling**:
   - Implement consistent error structure
   - Add appropriate logging
   - Include retry mechanisms for external services

3. **Security**:
   - Validate all inputs
   - Implement proper authentication
   - Use HTTPS for all communications

4. **Performance**:
   - Optimize database queries
   - Implement caching where appropriate
   - Use async/await for non-blocking operations
