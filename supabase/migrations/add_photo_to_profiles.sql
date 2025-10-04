-- Migration: Add photo column to profiles table for public user profile feature
-- This migration adds support for storing profile photo URLs and enables public read access
-- Created: 2025-09-29
-- Story: 2.1 - Add Photo Column and Public Access to Profiles

-- Add photo column to existing profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS photo TEXT;

-- Add descriptive comment to document the column purpose
COMMENT ON COLUMN public.profiles.photo IS 'URL to user profile photo stored externally';

-- Add public read access RLS policy
-- This allows unauthenticated users to read profile data for public profile viewing
DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;
CREATE POLICY "Allow public read access to profiles"
  ON public.profiles
  FOR SELECT
  TO public
  USING (true);

-- Grant SELECT permissions on profiles table to public role
-- This works in conjunction with the RLS policy above
GRANT SELECT ON public.profiles TO public;

-- Rollback instructions (for reference, do not execute):
-- DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;
-- REVOKE SELECT ON public.profiles FROM public;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS photo;
