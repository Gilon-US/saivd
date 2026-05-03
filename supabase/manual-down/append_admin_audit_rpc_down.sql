REVOKE ALL ON FUNCTION public.append_admin_audit(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_admin_audit(text, uuid, jsonb, jsonb, text, uuid, text) FROM PUBLIC;
DROP FUNCTION IF EXISTS public.append_admin_audit(jsonb);
DROP FUNCTION IF EXISTS public.append_admin_audit(text, uuid, jsonb, jsonb, text, uuid, text);
