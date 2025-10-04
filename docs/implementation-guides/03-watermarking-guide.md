# Watermarking Integration Guide

This guide covers the implementation of video watermarking functionality in the SAVD App using an external watermarking service.

## Overview

The SAVD App allows users to create watermarked versions of their uploaded videos through an external watermarking service. This guide explains how to implement the watermarking workflow, including API integration, callback handling, and user interface components.

## Prerequisites

- External watermarking service API credentials
- Next.js project with API routes
- Supabase project for storing watermarking metadata
- Wasabi storage for video files

## Implementation Steps

### 1. Set Up Watermarking Service Client

Create a utility file to handle communication with the external watermarking service:

```typescript
// src/lib/watermarkService.ts
import axios from 'axios';

const watermarkApiClient = axios.create({
  baseURL: process.env.WATERMARK_SERVICE_URL,
  headers: {
    'Authorization': `Bearer ${process.env.WATERMARK_SERVICE_API_KEY}`,
    'Content-Type': 'application/json',
  },
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
      success: true,
      jobId: response.data.jobId,
      estimatedProcessingTime: response.data.estimatedProcessingTime,
    };
  } catch (error: any) {
    console.error('Error requesting watermarking:', error);
    throw new Error(error.response?.data?.message || 'Failed to request watermarking');
  }
}

export async function checkWatermarkingStatus(jobId: string) {
  try {
    const response = await watermarkApiClient.get(`/status/${jobId}`);
    
    return {
      success: true,
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

### 2. Create Watermarking Request API

Implement an API route to request watermarking for a video:

```typescript
// src/app/api/videos/[id]/watermark/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requestWatermarking } from '@/lib/watermarkService';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: Request,
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
    
    // Generate callback URL
    const callbackToken = uuidv4();
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/callbacks/watermark?token=${callbackToken}`;
    
    // Request watermarking from external service
    const watermarkResult = await requestWatermarking(
      video.original_url,
      callbackUrl,
      options
    );
    
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
      { 
        success: false, 
        error: { 
          code: 'server_error', 
          message: error.message || 'Failed to request watermarking',
          reference: uuidv4() // For server-side logging reference
        } 
      },
      { status: 500 }
    );
  }
}
```

### 3. Create Watermarking Status API

Implement an API route to check the status of a watermarking job:

```typescript
// src/app/api/videos/[id]/watermark/status/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { checkWatermarkingStatus } from '@/lib/watermarkService';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  request: Request,
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
    
    // Get watermarking job
    const { data: job, error: jobError } = await supabase
      .from('watermarking_jobs')
      .select('*, watermarked_videos(*)')
      .eq('video_id', videoId)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      
    if (jobError || !job) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Watermarking job not found' } },
        { status: 404 }
      );
    }
    
    // If job is completed or has error, return current status
    if (job.status === 'completed' || job.status === 'error') {
      return NextResponse.json({
        success: true,
        data: {
          id: job.watermarked_video_id,
          status: job.status,
          watermarkedUrl: job.watermarked_videos.watermarked_url,
          watermarkedThumbnailUrl: job.watermarked_videos.watermarked_thumbnail_url,
          error: job.error_message,
        }
      });
    }
    
    // Check status from external service
    const statusResult = await checkWatermarkingStatus(job.external_job_id);
    
    // Update job status if changed
    if (statusResult.status !== job.status) {
      await supabase
        .from('watermarking_jobs')
        .update({
          status: statusResult.status,
          response_payload: statusResult,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
        
      // If completed, update watermarked video record
      if (statusResult.status === 'completed' && statusResult.result) {
        await supabase
          .from('watermarked_videos')
          .update({
            watermarked_url: statusResult.result.videoUrl,
            watermarked_thumbnail_url: statusResult.result.thumbnailUrl,
            status: 'completed',
            watermark_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.watermarked_video_id);
      } else if (statusResult.status === 'error') {
        await supabase
          .from('watermarked_videos')
          .update({
            status: 'error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.watermarked_video_id);
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        id: job.watermarked_video_id,
        status: statusResult.status,
        progress: statusResult.progress,
        result: statusResult.result,
      }
    });
  } catch (error: any) {
    console.error('Error checking watermarking status:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'server_error', 
          message: error.message || 'Failed to check watermarking status',
          reference: uuidv4() // For server-side logging reference
        } 
      },
      { status: 500 }
    );
  }
}
```

### 4. Create Watermarking Callback API

Implement a callback endpoint for the external watermarking service:

```typescript
// src/app/api/callbacks/watermark/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Direct Supabase client (not using cookies since this is a server-to-server call)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
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
        updated_at: new Date().toISOString(),
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
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.watermarked_video_id);
    } else if (status === 'error') {
      await supabase
        .from('watermarked_videos')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
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
      { 
        success: false, 
        error: { 
          code: 'server_error', 
          message: 'Failed to process watermarking callback',
          reference: uuidv4() // For server-side logging reference
        } 
      },
      { status: 500 }
    );
  }
}
```

### 5. Create Watermark Button Component

Implement a button component to initiate watermarking:

```typescript
// src/components/watermark/WatermarkButton.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { WaterDropIcon } from 'lucide-react';

type WatermarkButtonProps = {
  videoId: string;
  onWatermarkStart: (data: any) => void;
  disabled?: boolean;
};

export function WatermarkButton({ 
  videoId, 
  onWatermarkStart, 
  disabled = false 
}: WatermarkButtonProps) {
  const [loading, setLoading] = useState(false);
  
  const handleClick = async () => {
    if (loading || disabled) return;
    
    setLoading(true);
    
    try {
      const response = await fetch(`/api/videos/${videoId}/watermark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to start watermarking');
      }
      
      const { data } = await response.json();
      onWatermarkStart(data);
    } catch (error: any) {
      console.error('Error starting watermarking:', error);
      // You might want to show an error toast here
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Button
      onClick={handleClick}
      disabled={loading || disabled}
      className="w-full"
    >
      <WaterDropIcon className="mr-2 h-4 w-4" />
      {loading ? 'Processing...' : 'Create Watermarked Version'}
    </Button>
  );
}
```

### 6. Create Watermark Status Component

Implement a component to display watermarking status:

```typescript
// src/components/watermark/WatermarkStatus.tsx
import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2Icon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';

type WatermarkStatusProps = {
  videoId: string;
  initialStatus?: string;
  onStatusChange?: (status: string, data?: any) => void;
};

export function WatermarkStatus({ 
  videoId, 
  initialStatus = 'processing',
  onStatusChange
}: WatermarkStatusProps) {
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  
  useEffect(() => {
    if (status === 'completed' || status === 'error') {
      return;
    }
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/videos/${videoId}/watermark/status`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || 'Failed to check watermarking status');
        }
        
        const { data } = await response.json();
        
        setStatus(data.status);
        setProgress(data.progress || 0);
        
        if (data.result) {
          setResult(data.result);
        }
        
        if (data.error) {
          setError(data.error);
        }
        
        if (onStatusChange) {
          onStatusChange(data.status, data);
        }
        
        // Continue polling if still processing
        if (data.status === 'processing') {
          setTimeout(checkStatus, 5000); // Poll every 5 seconds
        }
      } catch (error: any) {
        console.error('Error checking watermarking status:', error);
        setError(error.message || 'Failed to check watermarking status');
        setStatus('error');
        
        if (onStatusChange) {
          onStatusChange('error', { error: error.message });
        }
      }
    };
    
    checkStatus();
    
    // Cleanup function
    return () => {
      // If there's an active timeout, it will be cleared
    };
  }, [videoId, status, onStatusChange]);
  
  if (status === 'completed') {
    return (
      <div className="space-y-2">
        <div className="flex items-center text-green-600">
          <CheckCircleIcon className="mr-2 h-5 w-5" />
          <span className="font-medium">Watermarking Complete</span>
        </div>
      </div>
    );
  }
  
  if (status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon className="h-4 w-4" />
        <AlertDescription>
          {error || 'An error occurred during watermarking'}
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center text-amber-600">
          <Loader2Icon className="mr-2 h-5 w-5 animate-spin" />
          <span className="font-medium">Watermarking in progress...</span>
        </div>
        {progress > 0 && <span className="text-sm">{progress}%</span>}
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}
```

### 7. Create Watermark Placeholder Component

Implement a placeholder component for unwatermarked videos:

```typescript
// src/components/watermark/WatermarkPlaceholder.tsx
import { WatermarkButton } from '@/components/watermark/WatermarkButton';
import { WatermarkStatus } from '@/components/watermark/WatermarkStatus';
import { WaterDropIcon } from 'lucide-react';

type WatermarkPlaceholderProps = {
  videoId: string;
  status?: string;
  onWatermarkStart: (data: any) => void;
  onStatusChange?: (status: string, data?: any) => void;
};

export function WatermarkPlaceholder({ 
  videoId, 
  status, 
  onWatermarkStart,
  onStatusChange
}: WatermarkPlaceholderProps) {
  if (status === 'processing') {
    return (
      <div className="border rounded-lg p-4 bg-gray-50 h-full flex flex-col items-center justify-center">
        <WatermarkStatus 
          videoId={videoId} 
          initialStatus="processing"
          onStatusChange={onStatusChange}
        />
      </div>
    );
  }
  
  if (status === 'error') {
    return (
      <div className="border rounded-lg p-4 bg-gray-50 h-full flex flex-col items-center justify-center space-y-4">
        <WatermarkStatus 
          videoId={videoId} 
          initialStatus="error"
          onStatusChange={onStatusChange}
        />
        <WatermarkButton 
          videoId={videoId} 
          onWatermarkStart={onWatermarkStart}
        />
      </div>
    );
  }
  
  return (
    <div className="border rounded-lg p-4 bg-gray-50 h-full flex flex-col items-center justify-center space-y-4">
      <div className="text-center">
        <div className="bg-primary/10 p-4 rounded-full mx-auto mb-4">
          <WaterDropIcon className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium">Create Watermarked Version</h3>
        <p className="text-sm text-gray-500 mt-1">
          Add a watermark to protect your video content
        </p>
      </div>
      <WatermarkButton 
        videoId={videoId} 
        onWatermarkStart={onWatermarkStart}
      />
    </div>
  );
}
```

### 8. Integrate Watermarking into Video Card Component

Update the video card component to include watermarking functionality:

```typescript
// src/components/video/VideoCard.tsx
import { useState } from 'react';
import Image from 'next/image';
import { WatermarkPlaceholder } from '@/components/watermark/WatermarkPlaceholder';
import { PublicUrlGenerator } from '@/components/watermark/PublicUrlGenerator';
import { Button } from '@/components/ui/button';
import { TrashIcon } from 'lucide-react';

type VideoCardProps = {
  video: {
    id: string;
    filename: string;
    originalUrl: string;
    originalThumbnailUrl: string;
    watermarkedVideo?: {
      id: string;
      watermarkedUrl: string;
      watermarkedThumbnailUrl: string;
      status: string;
      hasPublicAccess: boolean;
    };
  };
  onDelete: (videoId: string) => void;
  onWatermarkDelete: (watermarkedId: string) => void;
};

export function VideoCard({ video, onDelete, onWatermarkDelete }: VideoCardProps) {
  const [watermarkStatus, setWatermarkStatus] = useState<string>(
    video.watermarkedVideo?.status || 'none'
  );
  const [watermarkedId, setWatermarkedId] = useState<string | null>(
    video.watermarkedVideo?.id || null
  );
  
  const handleWatermarkStart = (data: any) => {
    setWatermarkStatus('processing');
    setWatermarkedId(data.id);
  };
  
  const handleStatusChange = (status: string, data?: any) => {
    setWatermarkStatus(status);
    
    // If completed, refresh the page to show the watermarked version
    if (status === 'completed') {
      // In a real app, you might want to update the state instead of refreshing
      window.location.reload();
    }
  };
  
  const handleDeleteWatermark = () => {
    if (watermarkedId) {
      onWatermarkDelete(watermarkedId);
      setWatermarkStatus('none');
      setWatermarkedId(null);
    }
  };
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-3 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="font-medium truncate" title={video.filename}>
            {video.filename}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(video.id)}
            title="Delete video"
          >
            <TrashIcon className="h-4 w-4 text-gray-500" />
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {/* Original Video */}
        <div>
          <h4 className="text-sm font-medium mb-2">Original</h4>
          <div className="aspect-video bg-gray-100 rounded-md overflow-hidden relative">
            {video.originalThumbnailUrl ? (
              <Image
                src={video.originalThumbnailUrl}
                alt={video.filename}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-gray-400">No thumbnail</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Watermarked Version or Placeholder */}
        <div>
          <h4 className="text-sm font-medium mb-2">Watermarked</h4>
          {video.watermarkedVideo && watermarkStatus === 'completed' ? (
            <div className="space-y-2">
              <div className="aspect-video bg-gray-100 rounded-md overflow-hidden relative">
                <Image
                  src={video.watermarkedVideo.watermarkedThumbnailUrl}
                  alt={`${video.filename} (Watermarked)`}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex space-x-2">
                <PublicUrlGenerator
                  videoId={video.id}
                  watermarkedId={video.watermarkedVideo.id}
                  hasPublicAccess={video.watermarkedVideo.hasPublicAccess}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteWatermark}
                >
                  <TrashIcon className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <WatermarkPlaceholder
              videoId={video.id}
              status={watermarkStatus}
              onWatermarkStart={handleWatermarkStart}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

## Testing Watermarking Integration

To test the watermarking implementation:

1. Upload a video to the system
2. Click the "Create Watermarked Version" button
3. Verify that the status updates during processing
4. Check that the watermarked version appears when processing is complete
5. Test generating a public URL for the watermarked video
6. Test deleting the watermarked version

## Common Issues and Solutions

### Issue: Watermarking service callback fails

**Solution**: Ensure that your callback URL is publicly accessible and properly configured. If running in development, you may need to use a service like ngrok to expose your local server.

### Issue: Watermarking status doesn't update

**Solution**: Check that the polling mechanism is working correctly and that the external service is sending status updates. Implement proper error handling and retry logic.

### Issue: Watermarked videos are not displayed

**Solution**: Verify that the watermarked video URLs are correct and accessible. Check that the database records are being properly updated when watermarking completes.

## Next Steps

After implementing basic watermarking functionality, consider adding:

1. Watermark customization options (position, opacity, text)
2. Batch watermarking for multiple videos
3. Watermarking presets for consistent branding
4. Preview of watermark before processing
5. Automatic retry for failed watermarking jobs

These features can enhance the user experience and provide more control over the watermarking process.
