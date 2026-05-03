ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

COMMENT ON COLUMN public.profiles.role IS 'Application-level role: admin or user';
