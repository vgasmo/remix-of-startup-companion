-- RC12 (sql_db) · OPS-13 — cron URL configurable with unchanged production fallback.
DO $guard$
DECLARE v_def text; v_md5 text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='cron_invoke_edge' AND pg_get_function_identity_arguments(p.oid)='p_function text, p_payload jsonb';
  v_md5 := md5(v_def);
  IF v_md5 NOT IN ('31e547c774e8660a7c5f95cf7243f042', '1f1cea717b5a1982e1704b9590026f23') THEN
    RAISE EXCEPTION 'rc12: definicao de public.cron_invoke_edge divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar', v_md5;
  END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.cron_invoke_edge(p_function text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  v_url text;
  v_token text;
  v_request_id bigint;
BEGIN
  IF p_function IS NULL OR p_function = '' THEN
    RAISE EXCEPTION 'cron_invoke_edge: function name required' USING ERRCODE = '22023';
  END IF;

  v_url := COALESCE(NULLIF(current_setting('app.edge_base_url', true), ''), 'https://apxzuslwhjujgrcsfzqw.supabase.co')
           || '/functions/v1/' || p_function;
  v_token := public.issue_cron_token(p_function);

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', v_token
    ),
    body := COALESCE(p_payload, '{}'::jsonb),
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.cron_invoke_edge(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_invoke_edge(text, jsonb) TO service_role;