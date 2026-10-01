DO $$
DECLARE r record;
BEGIN
  -- Trigger functions never need direct EXECUTE (triggers fire regardless).
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.accept_workspace_invitation FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation TO authenticated;