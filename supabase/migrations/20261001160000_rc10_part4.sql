-- RC10 · Parte C — defeitos LOW
-- Migração nova. Idempotente: pode correr duas vezes.

-- ── C1. first_contact_outbox sem consumidor: alertar o staff quando o convite Teams ou o email ao consultor falha ──
CREATE OR REPLACE FUNCTION public.check_first_contact_outbox()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.system_alerts (kind, severity, dedupe_key, payload)
  SELECT 'first_contact_outbox_stuck', 'high', 'first_contact_outbox:' || o.id::text,
         jsonb_build_object('outbox_id', o.id, 'funnel_item_id', o.funnel_item_id, 'kind', o.kind,
                            'status', o.status, 'last_error', o.last_error, 'created_at', o.created_at)
    FROM public.first_contact_outbox o
   WHERE o.kind IN ('graph_event', 'consultant_email')
     AND o.status IN ('pending', 'in_progress', 'failed')
     AND o.created_at < now() - interval '30 minutes'
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.check_first_contact_outbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_first_contact_outbox() TO service_role;
DO $do$
BEGIN
  PERFORM cron.unschedule('check-first-contact-outbox')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-first-contact-outbox');
  PERFORM cron.schedule('check-first-contact-outbox', '7 * * * *',
    $cron$SELECT public.cron_invoke_rpc('check_first_contact_outbox', 'public.check_first_contact_outbox()')$cron$);
END $do$;
INSERT INTO public.automation_health_expectations (job_name, expected_cadence_seconds, grace_seconds, severity)
VALUES ('check_first_contact_outbox', 3600, 900, 'low')
ON CONFLICT (job_name) DO NOTHING;

-- ── C2. Importador HubSpot v2 (flag desligada): o commit corre com service role e grava tipos válidos ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.commit_import_funnel_item(uuid,uuid,uuid,timestamptz,jsonb,jsonb,text,text[])'::regprocedure);
  IF position($q$coalesce(auth.role(), '') = 'service_role'$q$ IN d) > 0 THEN
    RETURN;  -- já aplicado
  END IF;
  IF position($q$IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'backoffice')) THEN$q$ IN d) = 0
     OR position($q$COALESCE(p_payload->>'type','startup')$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC10 C2: texto esperado não encontrado em commit_import_funnel_item';
  END IF;
  d := replace(d, $q$IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'backoffice')) THEN$q$,
                  $q$IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'backoffice')) THEN$q$);
  d := replace(d, $q$COALESCE(p_payload->>'type','startup')$q$,
                  $q$CASE WHEN p_payload->>'type' IN ('lead','contract','startup_candidate','startup_active') THEN p_payload->>'type' ELSE 'lead' END$q$);
  EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION public.commit_import_funnel_item(uuid,uuid,uuid,timestamptz,jsonb,jsonb,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_import_funnel_item(uuid,uuid,uuid,timestamptz,jsonb,jsonb,text,text[]) TO service_role;

-- ── C3. apply_contract_patch: SECURITY DEFINER sem verificação de papel e sem chamadores ──
REVOKE ALL ON FUNCTION public.apply_contract_patch(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_contract_patch(uuid, jsonb, text) TO service_role;

-- ── C4. O backoffice aprova candidaturas: tem de ver quem as submeteu ──
DROP POLICY IF EXISTS "Backoffice can view workspace users" ON public.workspace_users;
CREATE POLICY "Backoffice can view workspace users" ON public.workspace_users
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'backoffice'::public.app_role));

-- ── C5. 'Associar' nas sugestões de 'Atribuir Workspace' não reativa workspaces arquivadas ou rejeitadas ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.staff_assign_or_create_workspace(uuid,text,uuid,text,uuid,text,text)'::regprocedure);
  IF position('workspace_archived_or_rejected' IN d) > 0 THEN RETURN; END IF;  -- já aplicado
  IF position($q$SELECT w.startup_id INTO v_startup_id FROM public.workspaces w WHERE w.id = v_workspace_id;$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC10 C5: texto esperado não encontrado em staff_assign_or_create_workspace';
  END IF;
  d := replace(d, $q$SELECT w.startup_id INTO v_startup_id FROM public.workspaces w WHERE w.id = v_workspace_id;$q$,
    $q$SELECT w.startup_id INTO v_startup_id FROM public.workspaces w WHERE w.id = v_workspace_id;
    IF EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = v_workspace_id AND w.status IN ('archived','rejected')) THEN
      RAISE EXCEPTION 'workspace_archived_or_rejected' USING ERRCODE = '22023';
    END IF;$q$);
  EXECUTE d;
END $$;
```
