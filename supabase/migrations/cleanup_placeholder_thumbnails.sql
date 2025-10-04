-- Clean up placeholder thumbnail URLs from existing videos
-- This migration removes placeholder URLs that cause 404 errors

UPDATE public.videos 
SET original_thumbnail_url = NULL 
WHERE original_thumbnail_url = '/placeholder-video-thumbnail.jpg' 
   OR original_thumbnail_url LIKE '%placeholder-video-thumbnail%';

-- Add a comment to document this cleanup
-- COMMENT: Removed placeholder thumbnail URLs to prevent 404 errors and allow proper fallback to browser-generated thumbnails
