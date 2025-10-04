-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create videos table
CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  filesize BIGINT NOT NULL,
  content_type TEXT NOT NULL,
  original_url TEXT NOT NULL,
  original_thumbnail_url TEXT,
  processed_url TEXT,
  processed_thumbnail_url TEXT,
  title TEXT,
  description TEXT,
  duration INTEGER,
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'processed', 'failed')),
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drop existing policies if they exist (for idempotent script)
DROP POLICY IF EXISTS "Users can view their own videos" ON public.videos;
DROP POLICY IF EXISTS "Users can insert their own videos" ON public.videos;
DROP POLICY IF EXISTS "Users can update their own videos" ON public.videos;
DROP POLICY IF EXISTS "Users can delete their own videos" ON public.videos;
-- Drop the anonymous policy if it exists
DROP POLICY IF EXISTS "Allow anonymous uploads for debugging" ON public.videos;

-- Add RLS policies
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own videos
CREATE POLICY "Users can view their own videos" 
  ON public.videos 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Policy for users to insert their own videos
CREATE POLICY "Users can insert their own videos" 
  ON public.videos 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Policy for users to update their own videos
CREATE POLICY "Users can update their own videos" 
  ON public.videos 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Policy for users to delete their own videos
CREATE POLICY "Users can delete their own videos" 
  ON public.videos 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Add indexes
CREATE INDEX IF NOT EXISTS videos_user_id_idx ON public.videos (user_id);
CREATE INDEX IF NOT EXISTS videos_upload_date_idx ON public.videos (upload_date);
CREATE INDEX IF NOT EXISTS videos_status_idx ON public.videos (status);

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS update_videos_updated_at ON public.videos;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Add function to update updated_at timestamp
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_videos_updated_at
BEFORE UPDATE ON public.videos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;

-- Create a function to handle video deletion cleanup
CREATE OR REPLACE FUNCTION handle_video_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Add code here to delete files from storage if needed
  -- For example: PERFORM supabase_storage.delete_object('videos', OLD.key);
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to run the cleanup function when a video is deleted
CREATE TRIGGER before_video_delete
  BEFORE DELETE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION handle_video_deletion();

-- Add a comment to the table for documentation
COMMENT ON TABLE public.videos IS 'Stores metadata for user-uploaded videos';
