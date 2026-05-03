-- Argument order (new_role, target_id) matches PostgREST / supabase-js RPC resolution (text, uuid).
-- Bootstrap email check must stay aligned with `BOOTSTRAP_SUPERUSER_EMAIL` in `src/lib/bootstrap-superuser.ts`.

CREATE OR REPLACE FUNCTION public.set_user_role(new_role text, target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  caller_email text;
  current_target_role text;
  admin_count int;
  is_privileged boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('saivd_admin_cap'));

  IF new_role NOT IN ('user', 'admin', 'superuser') THEN
    RAISE EXCEPTION 'invalid role %', new_role;
  END IF;

  SELECT p.role, p.email INTO caller_role, caller_email FROM public.profiles p WHERE p.id = auth.uid();
  is_privileged :=
    caller_role IS NOT DISTINCT FROM 'superuser'
    OR (caller_email IS NOT NULL AND lower(trim(caller_email)) = lower(trim('elon@saivd.io')));

  IF NOT is_privileged THEN
    RAISE EXCEPTION 'only superuser can change roles';
  END IF;

  SELECT role INTO current_target_role FROM public.profiles WHERE id = target_id;
  IF current_target_role IS NULL THEN
    RAISE EXCEPTION 'target user not found';
  END IF;

  IF target_id = auth.uid() AND new_role <> 'superuser' THEN
    RAISE EXCEPTION 'superuser cannot demote themselves';
  END IF;

  IF new_role = 'superuser' AND target_id <> auth.uid() THEN
    RAISE EXCEPTION 'cannot create a second superuser';
  END IF;

  IF new_role = 'admin' AND current_target_role <> 'admin' THEN
    SELECT COUNT(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
    IF admin_count >= 3 THEN
      RAISE EXCEPTION 'admin cap reached (3)';
    END IF;
  END IF;

  UPDATE public.profiles
     SET role = new_role, updated_at = NOW()
   WHERE id = target_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, "before", "after")
  VALUES (
    auth.uid(),
    'set_user_role',
    target_id,
    jsonb_build_object('role', current_target_role),
    jsonb_build_object('role', new_role)
  );
END $$;

REVOKE ALL ON FUNCTION public.set_user_role(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(text, uuid) TO authenticated;
