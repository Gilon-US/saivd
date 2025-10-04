# Public Sharing Implementation Guide

This guide covers the implementation of public sharing functionality for watermarked videos in the SAVD App.

## Overview

The SAVD App allows users to generate public URLs for their watermarked videos, enabling them to share content with others without requiring authentication. This guide explains how to implement the public URL generation, management, and viewing functionality.

## Prerequisites

- Next.js project with API routes
- Supabase project for storing public access tokens
- Watermarking functionality implemented

## Implementation Steps

### 1. Create Public URL Generation API

Implement an API route to generate public URLs for watermarked videos:

```typescript
// src/app/api/videos/[id]/public-url/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';

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
    if (!video.watermarked_videos || video.watermarked_videos.length === 0 || video.watermarked_videos[0].status !== 'completed') {
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
          updated_at: new Date().toISOString(),
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
      { 
        success: false, 
        error: { 
          code: 'server_error', 
          message: error.message || 'Failed to generate public URL',
          reference: uuidv4() // For server-side logging reference
        } 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
        updated_at: new Date().toISOString(),
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
      { 
        success: false, 
        error: { 
          code: 'server_error', 
          message: error.message || 'Failed to revoke public access',
          reference: uuidv4() // For server-side logging reference
        } 
      },
      { status: 500 }
    );
  }
}
```

### 2. Create Public Video Viewing Page

Implement a page for viewing shared videos:

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
              <PublicVideoPlayer videoUrl={video.watermarkedUrl} />
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

### 3. Create Public Video Player Component

Implement a video player component for public videos:

```typescript
// src/components/video/PublicVideoPlayer.tsx
'use client';

import { useRef, useState, useEffect } from 'react';

type PublicVideoPlayerProps = {
  videoUrl: string;
};

export function PublicVideoPlayer({ videoUrl }: PublicVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setProgress((video.currentTime / video.duration) * 100);
    };
    
    const handleDurationChange = () => {
      setDuration(video.duration);
    };
    
    const handleError = () => {
      setError('Error loading video');
    };
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('error', handleError);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
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
  
  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    
    const value = parseFloat(e.target.value);
    const time = (value / 100) * video.duration;
    
    video.currentTime = time;
    setProgress(value);
    setCurrentTime(time);
  };
  
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    
    const value = parseFloat(e.target.value);
    video.volume = value;
    setVolume(value);
  };
  
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };
  
  if (error) {
    return (
      <div className="aspect-video bg-gray-900 flex items-center justify-center text-white">
        <p>{error}</p>
      </div>
    );
  }
  
  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full aspect-video bg-black"
        playsInline
        onClick={togglePlay}
      />
      
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center space-x-2 text-white">
          <button
            onClick={togglePlay}
            className="p-2 rounded-full hover:bg-white/20"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            )}
          </button>
          
          <span className="text-sm">{formatTime(currentTime)}</span>
          
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={handleProgressChange}
            className="flex-grow h-1 bg-white/30 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
          
          <span className="text-sm">{formatTime(duration)}</span>
          
          <div className="relative group">
            <button
              className="p-2 rounded-full hover:bg-white/20"
              aria-label="Volume"
            >
              {volume === 0 ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
              ) : volume < 0.5 ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
              )}
            </button>
            
            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/80 p-2 rounded-lg">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="w-24 h-1 bg-white/30 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 4. Create Public URL Generator Component

Implement a component for generating and managing public URLs:

```typescript
// src/components/watermark/PublicUrlGenerator.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LinkIcon, CopyIcon, CheckIcon, TrashIcon } from 'lucide-react';

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
    } catch (error: any) {
      console.error('Error generating public URL:', error);
      setError(error.message || 'Failed to generate public URL');
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
      // Close the dialog
      setIsOpen(false);
      
      // In a real app, you might want to update the parent component
      window.location.reload();
    } catch (error: any) {
      console.error('Error revoking public access:', error);
      setError(error.message || 'Failed to revoke public access');
    } finally {
      setLoading(false);
    }
  };
  
  const copyToClipboard = async () => {
    if (!publicUrl) return;
    
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    
    if (open) {
      // Reset states when opening
      setPublicUrl(null);
      setError(null);
      setCopied(false);
      
      // If the video already has public access, generate the URL automatically
      if (hasPublicAccess) {
        generatePublicUrl();
      }
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <LinkIcon className="h-4 w-4 mr-1" />
          {hasPublicAccess ? 'Get Public URL' : 'Share'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Watermarked Video</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {!publicUrl && !loading && !hasPublicAccess && (
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
                <Label htmlFor="public-url">Public URL</Label>
                <div className="flex space-x-2">
                  <Input
                    id="public-url"
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
                  <TrashIcon className="h-4 w-4 mr-1" />
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

### 5. Create Not Found Page for Invalid Tokens

Implement a custom not found page for invalid or expired tokens:

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

### 6. Add Metadata for Shared Videos

Enhance the public video page with proper metadata for better sharing experience:

```typescript
// src/app/watch/[token]/layout.tsx
import { Metadata } from 'next';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function generateMetadata({ 
  params 
}: { 
  params: { token: string } 
}): Promise<Metadata> {
  const { token } = params;
  
  // Get video details for metadata
  const supabase = createServerComponentClient({ cookies });
  
  const { data: accessToken } = await supabase
    .from('public_access_tokens')
    .select('*, watermarked_videos(*)')
    .eq('token', token)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .single();
    
  if (!accessToken) {
    return {
      title: 'Video Not Found',
      description: 'The video you are looking for is not available.',
    };
  }
  
  const { data: video } = await supabase
    .from('videos')
    .select('filename')
    .eq('id', accessToken.watermarked_videos.video_id)
    .single();
    
  return {
    title: video ? `${video.filename} - SAVD App` : 'Shared Video - SAVD App',
    description: 'Watch this shared video from SAVD App',
    openGraph: {
      title: video ? `${video.filename} - SAVD App` : 'Shared Video - SAVD App',
      description: 'Watch this shared video from SAVD App',
      images: [accessToken.watermarked_videos.watermarked_thumbnail_url],
    },
    twitter: {
      card: 'summary_large_image',
      title: video ? `${video.filename} - SAVD App` : 'Shared Video - SAVD App',
      description: 'Watch this shared video from SAVD App',
      images: [accessToken.watermarked_videos.watermarked_thumbnail_url],
    },
  };
}

export default function WatchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
```

## Testing Public Sharing

To test the public sharing implementation:

1. Upload a video and create a watermarked version
2. Generate a public URL for the watermarked video
3. Copy the URL and open it in a different browser or incognito window
4. Verify that the video plays correctly without requiring authentication
5. Test revoking access and confirm that the URL no longer works

## Common Issues and Solutions

### Issue: Public URLs are accessible after being revoked

**Solution**: Ensure that the token validation checks both the `is_active` flag and the expiration date. Add a caching layer if necessary to prevent access to recently revoked URLs.

### Issue: Video doesn't play in the public player

**Solution**: Check that the video URL is accessible without authentication. You may need to configure CORS settings on your storage service to allow access from your domain.

### Issue: Metadata doesn't appear when sharing links

**Solution**: Verify that the metadata is correctly generated and that the page is server-rendered. Test the shared links with social media debugging tools like the Facebook Sharing Debugger or Twitter Card Validator.

## Next Steps

After implementing basic public sharing functionality, consider adding:

1. View tracking for shared videos
2. Password protection for shared links
3. Expiration date selection for public URLs
4. Domain restrictions for shared links
5. Embedded player for use on external websites

These features can enhance the sharing experience and provide more control over how content is accessed.
