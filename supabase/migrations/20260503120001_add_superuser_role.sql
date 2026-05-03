ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'superuser'));

COMMENT ON COLUMN public.profiles.role IS 'Application-level role: user, admin, or superuser';
