DROP POLICY IF EXISTS "Service role inserts audit log" ON public.admin_audit_log;
REVOKE INSERT ON public.admin_audit_log FROM service_role;
REVOKE USAGE, SELECT ON SEQUENCE public.admin_audit_log_id_seq FROM service_role;
