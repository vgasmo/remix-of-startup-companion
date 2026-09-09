DO $$
DECLARE r record;
BEGIN
  -- 1) Internal trigger-only routines: not callable directly by app users
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;

  -- 2) Privileged / staff / automation RPCs: no anonymous execution
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname !~ '^(is_|has_|can_|resolve_canonical|get_canonical|check_signup_allowed|accept_workspace_invitation|touch_public_booking_rate_limit|safe_profiles|founder_notifications_blocked)'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;