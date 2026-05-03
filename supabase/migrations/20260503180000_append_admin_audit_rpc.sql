-- Reliable audit writes from the app service-role client via PostgREST RPC.
-- Single jsonb argument avoids PGRST202 overload / schema-cache resolution issues with many typed params.

CREATE OR REPLACE FUNCTION public.append_admin_audit(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_action text;
  v_target uuid;
  v_ip text;
  v_ua text;
  tid text;
BEGIN
  v_actor := (p_payload->>'actor_id')::uuid;
  v_action := p_payload->>'action';
  tid := trim(coalesce(p_payload->>>'target_id', ''));
  IF tid = '' THEN
    v_target := NULL;
  ELSE
    v_target := tid::uuid;
  END IF;
  v_ip := NULLIF(trim(coalesce(p_payload->>>'ip', '')), '');
  v_ua := NULLIF(trim(coalesce(p_payload->>>'user_agent', '')), '');

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, "before", "after", ip, user_agent)
  VALUES (v_actor, v_action, v_target, p_payload->'before', p_payload->'after', v_ip, v_ua);
END;
$$;

REVOKE ALL ON FUNCTION public.append_admin_audit(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_admin_audit(jsonb) TO service_role;
