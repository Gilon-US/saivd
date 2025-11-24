-- Migration: Fix profiles INSERT permissions for Supabase auth/signup
--
-- Problem:
--   After enabling RLS and adding the policy:
--     CREATE POLICY "Users can insert their own profile" ON public.profiles
--       FOR INSERT WITH CHECK (auth.uid() = id);
--   the insert performed by the handle_new_user() trigger during /signup
--   started failing with:
--     ERROR: permission denied for table profiles (SQLSTATE 42501)
--
--   In your Supabase project, this policy is currently applied to role "public".
--   When the trigger runs as the Supabase auth/service role, auth.uid() is NULL,
--   so the WITH CHECK (auth.uid() = id) condition fails and the insert is blocked.
--
-- Fix:
--   - Recreate the existing INSERT policy with the same name and role (public)
--     but extend the WITH CHECK condition to also allow inserts when the
--     current role is the Supabase service role:
--       auth.role() = 'service_role'
--   - This keeps the dashboard view consistent while unblocking the
--     handle_new_user() trigger during signup.

-- Drop the previous INSERT policy if it exists
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Recreate INSERT policy so that normal users can insert their own profile row
-- via PostgREST when auth.uid() = id.
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = id);

-- Add a separate policy that allows the Supabase service role (used by auth
-- and triggers) to insert any profile row, so handle_new_user() works during
-- /signup even though auth.uid() is NULL in that context.
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;

CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Ensure INSERT privilege at SQL level for the relevant roles.
-- (If these GRANTs already exist, running them again is harmless.)
GRANT INSERT ON public.profiles TO authenticated, service_role;

-- Optional documentation comments
COMMENT ON POLICY "Users can insert their own profile" ON public.profiles
  IS 'Allows users to create their own profile row when auth.uid() = id.';

COMMENT ON POLICY "Service role can insert profiles" ON public.profiles
  IS 'Allows Supabase service_role to insert profiles (e.g. from handle_new_user() trigger during signup).';
