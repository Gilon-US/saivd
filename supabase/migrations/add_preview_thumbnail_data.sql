-- Add preview_thumbnail_data column to videos table for browser-generated thumbnails
-- This migration adds support for storing base64 encoded thumbnails generated in the browser

ALTER TABLE public.videos 
ADD COLUMN IF NOT EXISTS preview_thumbnail_data TEXT;

-- Add a comment to document the purpose of this field
COMMENT ON COLUMN public.videos.preview_thumbnail_data IS 'Base64 encoded thumbnail image generated in the browser during upload';
