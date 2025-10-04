# SAVD App - Public Sharing Workflow

## Overview

The public sharing workflow in the SAVD App enables users to generate secure public URLs for their watermarked videos. This allows sharing content with external users without requiring authentication, while maintaining security and control over the shared content.

## Public Sharing Workflow Diagram

```
┌──────────┐     ┌───────────────┐     ┌───────────────┐
│          │  1  │               │  2  │               │
│  Client  │────▶│  Next.js API  │────▶│  Generate     │
│          │     │               │     │  Token        │
└──────────┘     └───────────────┘     └───────┬───────┘
      ▲                                        │
      │                                        │ 3
      │                                        ▼
      │                                ┌───────────────┐
      │                                │               │
      │                                │  Store Token  │
      │                                │  in Database  │
      │                                │               │
      │                                └───────┬───────┘
      │                                        │
      │                 4                      │
      └────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│                                                        │
│               Public URL: /watch/{token}               │
│                                                        │
└────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────┐     ┌───────────────┐     ┌───────────────┐
│          │  5  │               │  6  │               │
│  Viewer  │────▶│  Next.js      │────▶│  Validate     │
│          │     │  Public Page  │     │  Token        │
└──────────┘     └───────────────┘     └───────┬───────┘
                                               │
                                               │ 7
                                               ▼
                                       ┌───────────────┐
                                       │               │
                                       │  Serve Video  │
                                       │               │
                                       └───────────────┘
```

1. Client requests a public URL for a watermarked video
2. Next.js API generates a secure token
3. Token is stored in database with expiration date
4. Public URL is returned to client
5. External viewer accesses public URL
6. Next.js validates token (checks if valid, not expired)
7. Watermarked video is served to viewer

## Implementation Components

### 1. Public URL Generator Component

The frontend component that generates public URLs:

```typescript
// src/components/watermark/PublicUrlGenerator.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { LinkIcon, CopyIcon, CheckIcon } from 'lucide-react';

type PublicUrlGeneratorProps = {
  videoId: string;
  watermarkedId: string;
  hasPublicAccess?: boolean;
};

export function PublicUrlGenerator({ 
  videoId, 
  watermarkedId, 
  hasPublicAccess = false 
}: PublicUrlGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const generatePublicUrl = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/videos/${videoId}/public-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to generate public URL');
      }
      
      const { data } = await response.json();
      setPublicUrl(data.publicUrl);
      
      toast({
        title: 'Public URL generated',
        description: 'You can now share this link with others.',
        type: 'success',
      });
    } catch (error: any) {
      console.error('Error generating public URL:', error);
      setError(error.message || 'Failed to generate public URL');
      
      toast({
        title: 'Failed to generate URL',
        description: error.message || 'An error occurred',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };
  
  const revokePublicAccess = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/videos/${videoId}/public-url`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to revoke public access');
      }
      
      setPublicUrl(null);
      setIsOpen(false);
      
      toast({
        title: 'Public access revoked',
        description: 'The shared link is no longer accessible.',
        type: 'success',
      });
    } catch (error: any) {
      console.error('Error revoking public access:', error);
      setError(error.message || 'Failed to revoke public access');
      
      toast({
        title: 'Failed to revoke access',
        description: error.message || 'An error occurred',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };
  
  const copyToClipboard = async () => {
    if (!publicUrl) return;
    
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      
      toast({
        title: 'URL copied',
        description: 'Public URL copied to clipboard',
        type: 'success',
      });
      
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
      
      toast({
        title: 'Copy failed',
        description: 'Failed to copy URL to clipboard',
        type: 'error',
      });
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LinkIcon className="h-4 w-4 mr-1" />
          {hasPublicAccess ? 'Manage Sharing' : 'Share'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Watermarked Video</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md">
              {error}
            </div>
          )}
          
          {!publicUrl && !loading && (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-500">
                Generate a public URL to share your watermarked video with anyone.
                No login will be required to view the video.
              </p>
              <Button onClick={generatePublicUrl} disabled={loading}>
                Generate Public URL
              </Button>
            </div>
          )}
          
          {loading && (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          )}
          
          {publicUrl && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Public URL</label>
                <div className="flex space-x-2">
                  <Input
                    value={publicUrl}
                    readOnly
                    className="flex-grow"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyToClipboard}
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <CheckIcon className="h-4 w-4 text-green-500" />
                    ) : (
                      <CopyIcon className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Anyone with this link can view your watermarked video without logging in.
                </p>
              </div>
              
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                >
                  Close
                </Button>
                <Button
                  variant="destructive"
                  onClick={revokePublicAccess}
                  disabled={loading}
                >
                  Revoke Access
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 2. Public URL Generation API

The API endpoint that generates public URLs:

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
    
    // Check if a token already exists
    const { data: existingToken } = await supabase
      .from('public_access_tokens')
      .select('*')
      .eq('watermarked_video_id', watermarkedVideo.id)
      .eq('is_active', true)
      .single();
      
    if (existingToken) {
      // Update existing token
      await supabase
        .from('public_access_tokens')
        .update({
          token,
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', existingToken.id);
    } else {
      // Create new token
      await supabase
        .from('public_access_tokens')
        .insert({
          watermarked_video_id: watermarkedVideo.id,
          user_id: session.user.id,
          token,
          expires_at: expiresAt.toISOString(),
        });
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

export async function DELETE(
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
    
    // Check if watermarked version exists
    if (!video.watermarked_videos || video.watermarked_videos.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Watermarked version not found' } },
        { status: 404 }
      );
    }
    
    const watermarkedVideo = video.watermarked_videos[0];
    
    // Deactivate all tokens for this watermarked video
    await supabase
      .from('public_access_tokens')
      .update({
        is_active: false,
      })
      .eq('watermarked_video_id', watermarkedVideo.id)
      .eq('user_id', session.user.id);
      
    return NextResponse.json({
      success: true,
      data: {
        message: 'Public access revoked successfully',
      }
    });
  } catch (error: any) {
    console.error('Error revoking public access:', error);
    return NextResponse.json(
      { success: false, error: { code: 'server_error', message: 'Failed to revoke public access' } },
      { status: 500 }
    );
  }
}
```

### 3. Public Video Viewing Page

The page that displays publicly shared videos:

```typescript
// src/app/watch/[token]/page.tsx
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { PublicVideoPlayer } from '@/components/video/PublicVideoPlayer';

export const dynamic = 'force-dynamic';

async function getVideoByToken(token: string) {
  const supabase = createServerComponentClient({ cookies });
  
  // Get token and check if it's valid and not expired
  const { data: accessToken, error: tokenError } = await supabase
    .from('public_access_tokens')
    .select('*, watermarked_videos(*)')
    .eq('token', token)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .single();
    
  if (tokenError || !accessToken) {
    return null;
  }
  
  // Get video details
  const { data: video, error: videoError } = await supabase
    .from('videos')
    .select('filename')
    .eq('id', accessToken.watermarked_videos.video_id)
    .single();
    
  if (videoError || !video) {
    return null;
  }
  
  return {
    filename: video.filename,
    watermarkedUrl: accessToken.watermarked_videos.watermarked_url,
    watermarkedThumbnailUrl: accessToken.watermarked_videos.watermarked_thumbnail_url,
  };
}

export default async function WatchPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const video = await getVideoByToken(token);
  
  if (!video) {
    notFound();
  }
  
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-bold text-gray-900">SAVD App</h1>
        </div>
      </header>
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-lg font-medium">{video.filename}</h2>
            </div>
            <div className="p-4">
              <PublicVideoPlayer 
                videoUrl={video.watermarkedUrl} 
                thumbnailUrl={video.watermarkedThumbnailUrl}
              />
            </div>
          </div>
        </div>
      </main>
      
      <footer className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          Powered by SAVD App
        </div>
      </footer>
    </div>
  );
}
```

### 4. Public Video Player Component

A component for playing public videos:

```typescript
// src/components/video/PublicVideoPlayer.tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';

type PublicVideoPlayerProps = {
  videoUrl: string;
  thumbnailUrl?: string;
};

export function PublicVideoPlayer({ videoUrl, thumbnailUrl }: PublicVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleCanPlay = () => {
      setIsLoading(false);
    };
    
    const handleError = () => {
      setIsLoading(false);
      setError('Error loading video');
    };
    
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, []);
  
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };
  
  return (
    <div className="relative aspect-video bg-black rounded-md overflow-hidden">
      {isLoading && thumbnailUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src={thumbnailUrl}
            alt="Video thumbnail"
            fill
            className="object-contain"
          />
          <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
            <div className="h-12 w-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
          <p>{error}</p>
        </div>
      )}
      
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full"
        controls
        playsInline
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );
}
```

### 5. Not Found Page for Invalid Tokens

A custom 404 page for invalid or expired tokens:

```typescript
// src/app/watch/[token]/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Video Not Found</h1>
        <p className="text-gray-600 mb-6">
          The video you're looking for may have been removed, or the link has expired.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary/90"
        >
          Go to Homepage
        </Link>
      </div>
    </div>
  );
}
```

## Token Security

### Token Generation

1. **Secure Random Tokens**:
   - Use `nanoid` for generating secure, URL-friendly tokens
   - Configure appropriate token length (16 characters)
   - Ensure token uniqueness in database

2. **Token Storage**:
   - Store tokens in database with expiration date
   - Associate tokens with specific watermarked videos
   - Include user ID for authorization checks

3. **Token Rotation**:
   - Generate new tokens when updating existing public URLs
   - Invalidate old tokens when generating new ones
   - Implement token revocation functionality

### Token Validation

1. **Expiration Checks**:
   - Validate token expiration date on each request
   - Automatically reject expired tokens
   - Consider implementing grace period for expiration

2. **Active Status**:
   - Check if token is still active (not revoked)
   - Allow token deactivation without deletion
   - Track token usage statistics

3. **Resource Association**:
   - Verify token is associated with a valid watermarked video
   - Ensure watermarked video still exists
   - Validate that watermarking process is complete

## Access Control

### Public Access Limitations

1. **Content Restrictions**:
   - Only watermarked videos can be publicly shared
   - Original videos are never accessible via public URLs
   - Watermarked videos must have completed processing

2. **User Control**:
   - Only video owners can generate public URLs
   - Video owners can revoke access at any time
   - Consider implementing view limits or geo-restrictions

3. **Content Protection**:
   - Implement download restrictions where possible
   - Consider adding visible watermarks to player
   - Add copyright notices to public viewing page

### Security Headers

1. **Content Security Policy**:
   - Restrict resource loading to trusted sources
   - Prevent inline scripts for security
   - Configure frame ancestors to prevent clickjacking

2. **Cache Control**:
   - Configure appropriate cache headers for videos
   - Prevent caching of sensitive information
   - Consider using cache-busting for updated content

3. **Referrer Policy**:
   - Configure referrer policy to protect privacy
   - Consider implementing referrer restrictions
   - Track referrer statistics for analytics

## Error Handling

### Token Errors

1. **Invalid Tokens**:
   - Display user-friendly 404 page
   - Log invalid token attempts
   - Implement rate limiting for token validation

2. **Expired Tokens**:
   - Show specific message for expired tokens
   - Provide option to request new link
   - Track token expiration statistics

3. **Resource Errors**:
   - Handle missing video resources gracefully
   - Provide clear error messages
   - Implement fallback behavior

## Performance Considerations

1. **Token Validation Optimization**:
   - Index token column for fast lookups
   - Consider caching valid tokens
   - Implement efficient database queries

2. **Video Delivery**:
   - Consider using CDN for video delivery
   - Implement adaptive streaming for different bandwidths
   - Optimize video loading and buffering

3. **Page Performance**:
   - Optimize public viewing page loading speed
   - Implement lazy loading for video content
   - Minimize dependencies for public pages

## Implementation Guidelines

1. **Frontend Implementation**:
   - Provide clear UI for generating and managing public URLs
   - Implement copy-to-clipboard functionality
   - Display expiration information to users

2. **API Implementation**:
   - Validate all inputs thoroughly
   - Implement proper error handling
   - Use structured error responses

3. **Security Implementation**:
   - Follow security best practices for token handling
   - Implement proper access controls
   - Monitor and log security events
