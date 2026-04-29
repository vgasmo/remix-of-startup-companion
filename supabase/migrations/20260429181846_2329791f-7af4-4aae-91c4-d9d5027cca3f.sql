-- Restore anon EXECUTE on pre-auth RPCs that the recent revoke migration removed.
-- check_signup_allowed is intentionally callable by anon (signup form runs
-- before the user authenticates). It only returns a boolean; no PII leakage.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_signup_allowed'
  ) THEN
    EXECUTE (
      SELECT string_agg(
        format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated',
               p.proname, pg_get_function_identity_arguments(p.oid)),
        '; '
      )
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'check_signup_allowed'
    );
  END IF;
END $$;