-- Fix profiles table permissions and policies
-- This migration adds the missing INSERT policy and permissions for profiles

-- Add missing INSERT policy for profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Grant INSERT permission to authenticated users
GRANT INSERT ON public.profiles TO authenticated;

-- Add a comment to document this fix
COMMENT ON POLICY "Users can insert their own profile" ON public.profiles IS 'Allows users to create their own profile when it does not exist';
