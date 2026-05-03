-- Staff (admin + superuser) policies, block direct role column updates, guard trigger.
-- Also extends SELECT policy so superuser can read other profiles (not only admin).

DROP POLICY IF EXISTS "Users can view profiles (self or admin)" ON public.profiles;

CREATE POLICY "Users can view profiles (self or staff)"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p_staff
      WHERE p_staff.id = auth.uid()
        AND p_staff.role IN ('admin', 'superuser')
    )
  );

DROP POLICY IF EXISTS "Users can update profiles (self or admin)" ON public.profiles;

CREATE POLICY "Users can update profiles (self or staff)"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superuser')
    )
  );

REVOKE UPDATE (role) ON public.profiles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'role changes must go through public.set_user_role()';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_role_change ON public.profiles;
CREATE TRIGGER profiles_guard_role_change
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_role_change();
