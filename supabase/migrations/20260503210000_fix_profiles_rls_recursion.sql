-- Fix infinite recursion in profiles RLS policies.
-- The "Users can view profiles (self or staff)" SELECT policy contained an EXISTS
-- subquery that re-queried the profiles table, causing RLS to evaluate itself
-- recursively. The "Allow public read access to profiles" policy (USING true)
-- already permits all reads, so the self-referencing SELECT policy is dropped.
-- The UPDATE policy is fixed via a SECURITY DEFINER helper that bypasses RLS.

-- 1. Drop the recursive SELECT policy (redundant; public read policy covers all reads)
DROP POLICY IF EXISTS "Users can view profiles (self or staff)" ON public.profiles;

-- 2. SECURITY DEFINER helper: checks caller's staff role without triggering RLS
CREATE OR REPLACE FUNCTION public.is_current_user_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'superuser')
  );
$$;

-- 3. Fix the UPDATE policy to use the helper instead of an inline self-referencing subquery
DROP POLICY IF EXISTS "Users can update profiles (self or staff)" ON public.profiles;
CREATE POLICY "Users can update profiles (self or staff)"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id OR public.is_current_user_staff())
  WITH CHECK (auth.uid() = id OR public.is_current_user_staff());
