CREATE OR REPLACE FUNCTION public.check_cron_http_responses()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.system_alerts(kind, severity, dedupe_key, payload)
  SELECT 'cron_http_failed', 'warning', 'cron_http_response:' || r.id::text,
    jsonb_build_object('event_key', 'cron_http_response:' || r.id::text,
      'request_id', r.id, 'status_code', r.status_code,
      'has_error', coalesce(r.error_msg, '') <> '', 'timed_out', r.timed_out, 'response_at', r.created)
  FROM net._http_response r
  WHERE r.created >= now() - interval '1 hour' AND r.created <= now()
    AND (r.status_code < 200 OR r.status_code > 299 OR coalesce(r.error_msg, '') <> '')
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.check_cron_http_responses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_http_responses() TO service_role;