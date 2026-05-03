-- Manual rollback for 20260503120000_tighten_profiles_update_policy.sql

DROP TRIGGER IF EXISTS profiles_guard_role_change ON public.profiles;
DROP FUNCTION IF EXISTS public.guard_profile_role_change();

GRANT UPDATE (role) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can view profiles (self or staff)" ON public.profiles;
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

DROP POLICY IF EXISTS "Users can update profiles (self or staff)" ON public.profiles;
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
