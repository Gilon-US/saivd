-- Service-role API path (e.g. applyUserRoleChange) must INSERT audit rows; RLS alone is not enough without privilege.
GRANT INSERT ON public.admin_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_audit_log_id_seq TO service_role;

-- PostgREST / supabase-js service_role requests may not set current_user to the literal 'service_role' in all setups;
-- also allow when the JWT role claim is service_role (same intent as bypass for trusted server updates).
CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    jwt_role := coalesce(nullif(trim(current_setting('request.jwt.claim.role', true)), ''), '');
    IF current_user IN ('postgres', 'supabase_admin', 'service_role')
       OR jwt_role = 'service_role' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'role changes must go through public.set_user_role()';
  END IF;
  RETURN NEW;
END;
$$;
