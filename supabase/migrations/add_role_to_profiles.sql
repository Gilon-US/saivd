-- Add role field and admin-aware RLS to profiles

-- Add role column with default 'user' if it does not exist yet
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

COMMENT ON COLUMN public.profiles.role IS 'Application-level role: admin or user';

-- Optional: index for role-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Update RLS policies to support admin users managing profiles
-- NOTE: Do not touch the public-read policy for public profiles, only the self-only policies.

-- Drop existing self-only policies if they exist
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Admin-aware SELECT policy
CREATE POLICY "Users can view profiles (self or admin)"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p_admin
      WHERE p_admin.id = auth.uid()
        AND p_admin.role = 'admin'
    )
  );

-- Admin-aware UPDATE policy
CREATE POLICY "Users can update profiles (self or admin)"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p_admin
      WHERE p_admin.id = auth.uid()
        AND p_admin.role = 'admin'
    )
  );
