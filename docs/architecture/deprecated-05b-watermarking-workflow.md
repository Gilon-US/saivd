# SAVD App - Watermarking Workflow

## Overview

The watermarking workflow in the SAVD App enables users to create watermarked versions of their uploaded videos through an external watermarking service. This asynchronous process involves requesting watermarking, tracking the status, and handling callbacks when watermarking is complete.

## Watermarking Workflow Diagram

```
┌──────────┐     ┌───────────────┐     ┌───────────────┐
│          │  1  │               │  2  │               │
│  Client  │────▶│  Next.js API  │────▶│  External     │
│          │     │               │     │  Watermark    │
└──────────┘     └───────────────┘     │  Service      │
      ▲                                │               │
      │                                │               │
      │                                │               │
      │                                └───────┬───────┘
      │                                        │
      │                                        │ 3
      │                                        ▼
      │                                ┌───────────────┐
      │                                │               │
      │                                │  Next.js API  │
      │                                │  Callback     │
      │                                │               │
      │                                └───────┬───────┘
      │                                        │
      │                                        │ 4
      │                                        ▼
      │                                ┌───────────────┐
      │                                │               │
      │                                │  Database     │
      │                                │  Update       │
      │                                │               │
      │                                └───────┬───────┘
      │                                        │
      │                 5                      │
      └────────────────────────────────────────┘
```

1. Client requests watermarking for a specific video
2. Next.js API calls external watermarking service with video URL and callback URL
3. External service processes video and calls back to Next.js API when complete
4. API updates database with watermarked video information
5. Client receives updated video status (via polling or real-time updates)

## Implementation Components

### 1. Watermark Request Button Component

The frontend component that initiates the watermarking process:

```typescript
// src/components/watermark/WatermarkButton.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
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
  const { toast } = useToast();
  
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
      
      toast({
        title: 'Watermarking started',
        description: 'You will be notified when the process is complete.',
        type: 'info',
      });
      
      onWatermarkStart(data);
    } catch (error: any) {
      console.error('Error starting watermarking:', error);
      
      toast({
        title: 'Watermarking failed',
        description: error.message || 'Failed to start watermarking',
        type: 'error',
      });
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

### 2. Watermark Status Component

A component that displays the current status of the watermarking process:

```typescript
// src/components/watermark/WatermarkStatus.tsx
import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Alert } from '@/components/ui/alert';
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
        <p>{error || 'An error occurred during watermarking'}</p>
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

### 3. Watermarking Request API

The API endpoint that initiates the watermarking process:

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

### 4. Watermarking Status API

The API endpoint that checks the status of a watermarking job:

```typescript
// src/app/api/videos/[id]/watermark/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { checkWatermarkingStatus } from '@/lib/watermark';

export async function GET(
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
          })
          .eq('id', job.watermarked_video_id);
      } else if (statusResult.status === 'error') {
        await supabase
          .from('watermarked_videos')
          .update({
            status: 'error',
            error_message: statusResult.error || 'Unknown error',
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
      { success: false, error: { code: 'server_error', message: 'Failed to check watermarking status' } },
      { status: 500 }
    );
  }
}
```

### 5. Watermarking Callback API

The API endpoint that receives callbacks from the external watermarking service:

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

### 6. External Watermarking Service Client

A utility module for communicating with the external watermarking service:

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
      error: response.data.error,
    };
  } catch (error: any) {
    console.error('Error checking watermarking status:', error);
    throw new Error(error.response?.data?.message || 'Failed to check watermarking status');
  }
}
```

## Error Handling & Recovery

### Watermarking Error Handling

1. **Request Errors**:
   - Network errors: Retry with exponential backoff
   - Authentication errors: Verify API keys and permissions
   - Service unavailable: Queue for retry later

2. **Processing Errors**:
   - Invalid video format: Provide clear error message
   - Processing failure: Update status and notify user
   - Timeout: Implement configurable timeout with extension

3. **Callback Errors**:
   - Invalid token: Log security event
   - Database update failure: Implement retry mechanism
   - Missing data: Handle gracefully with defaults

### Recovery Mechanisms

1. **Job Monitoring**:
   - Implement background job to check status of long-running jobs
   - Detect stalled jobs and retry or notify user
   - Set maximum retry attempts with increasing intervals

2. **Callback Resilience**:
   - Implement idempotent callback handling
   - Store callback data before processing
   - Allow manual triggering of callback processing

3. **Service Fallbacks**:
   - Implement circuit breaker for external service
   - Queue jobs when service is unavailable
   - Provide alternative watermarking options

## Asynchronous Processing

### Callback Handling

1. **Callback Security**:
   - Validate callback tokens
   - Verify job IDs match
   - Implement rate limiting for callback endpoints

2. **Callback Processing**:
   - Update job status in database
   - Update watermarked video record
   - Trigger notifications if needed

3. **Webhook Configuration**:
   - Ensure callback URL is accessible from external service
   - Configure proper timeout and retry settings
   - Monitor callback success rates

### Status Tracking

1. **Status Polling**:
   - Implement client-side polling with increasing intervals
   - Provide clear progress indicators
   - Stop polling when final status is reached

2. **Real-time Updates**:
   - Consider Supabase real-time subscriptions for instant updates
   - Implement WebSocket for status notifications
   - Update UI immediately when status changes

## Performance Considerations

1. **Efficient Processing**:
   - Optimize callback handling for quick response
   - Use background processing for database updates
   - Implement proper connection pooling

2. **Scalability**:
   - Design for high concurrency of watermarking requests
   - Implement proper queue management
   - Consider rate limiting to prevent service overload

3. **Resource Management**:
   - Monitor external service usage
   - Implement fair scheduling for multiple users
   - Consider priority queuing for premium users

## Security Measures

1. **API Security**:
   - Secure API keys in environment variables
   - Implement proper authentication for all endpoints
   - Validate all inputs thoroughly

2. **Callback Security**:
   - Use secure random tokens for callbacks
   - Implement token expiration
   - Verify source IP addresses when possible

3. **Data Security**:
   - Ensure proper access control for watermarked videos
   - Implement Row-Level Security for all database tables
   - Log security-relevant events

## Implementation Guidelines

1. **Frontend Implementation**:
   - Provide clear status indicators
   - Implement proper error handling and user feedback
   - Consider optimistic UI updates

2. **API Implementation**:
   - Validate all inputs thoroughly
   - Implement proper authentication and authorization
   - Use structured error responses

3. **External Service Integration**:
   - Follow service API documentation carefully
   - Implement proper error handling and retry logic
   - Monitor service health and performance
