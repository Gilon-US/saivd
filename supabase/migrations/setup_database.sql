-- This is a master script that includes all necessary SQL to set up the database
-- You can run this script in the Supabase SQL Editor to set up everything at once

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

------------------------------------------
-- VIDEOS TABLE
------------------------------------------

-- Create videos table
CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  filesize BIGINT NOT NULL,
  content_type TEXT NOT NULL,
  original_url TEXT NOT NULL,
  original_thumbnail_url TEXT,
  preview_thumbnail_data TEXT, -- Base64 encoded thumbnail generated in browser
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

-- No anonymous upload policy - all uploads require authentication

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

------------------------------------------
-- PROFILES TABLE
------------------------------------------

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  photo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment for photo column
COMMENT ON COLUMN public.profiles.photo IS 'URL to user profile photo stored externally';

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow public read access to profiles"
  ON public.profiles
  FOR SELECT
  TO public
  USING (true);

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically create profile when a new user is created
CREATE TRIGGER handle_new_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP FUNCTION IF EXISTS update_profiles_updated_at_column();

-- Add function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_profiles_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION update_profiles_updated_at_column();

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- Grant public read access for public profile viewing
GRANT SELECT ON public.profiles TO public;

-- Add a comment to the table for documentation
COMMENT ON TABLE public.profiles IS 'Stores user profile information';
