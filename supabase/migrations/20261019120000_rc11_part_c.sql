-- RC11 · Parte C — importador CRM v2: type invalido no INSERT
-- Migracao nova. Idempotente: DO com guarda. Pode correr duas vezes sem erro.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.commit_import_funnel_item_v2(uuid,uuid,uuid,timestamptz,text,jsonb,jsonb,jsonb,text,text[])'::regprocedure);
  IF position($q$COALESCE(p_payload->>'type','startup')$q$ IN d) = 0 THEN RETURN; END IF;  -- ja aplicado
  d := replace(d, $q$COALESCE(p_payload->>'type','startup')$q$,
    $q$CASE WHEN p_payload->>'type' IN ('lead','contract','startup_candidate','startup_active') THEN p_payload->>'type' ELSE 'lead' END$q$);
  EXECUTE d;
END $$;
