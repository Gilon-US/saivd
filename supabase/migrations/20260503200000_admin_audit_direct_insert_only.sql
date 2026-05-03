-- Audit writes use the service-role client with PostgREST `.insert()` (no RPC). Some deployments
-- returned PGRST202 for `append_admin_audit`; drop those overloads and allow direct inserts.

DROP FUNCTION IF EXISTS public.append_admin_audit(jsonb);
DROP FUNCTION IF EXISTS public.append_admin_audit(text, uuid, jsonb, jsonb, text, uuid, text);

GRANT INSERT ON public.admin_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_audit_log_id_seq TO service_role;

DROP POLICY IF EXISTS "Service role inserts audit log" ON public.admin_audit_log;
CREATE POLICY "Service role inserts audit log"
  ON public.admin_audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);
