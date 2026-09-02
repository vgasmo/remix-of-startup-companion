-- 1. Financial scenario save: argument order of has_workspace_access was inverted
CREATE OR REPLACE FUNCTION public.save_financial_scenario_atomic(p_session_id uuid, p_version_label text, p_assumptions jsonb, p_metrics jsonb, p_scoring jsonb, p_metadata jsonb, p_command_id uuid, p_command_fingerprint text)
 RETURNS TABLE(version_id uuid, mode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_scenario public.financial_plan_scenario;
  v_existing uuid;
  v_new uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  IF p_command_fingerprint IS NULL OR length(btrim(p_command_fingerprint)) = 0 THEN
    RAISE EXCEPTION 'command_fingerprint_required' USING ERRCODE = '22023';
  END IF;

  SELECT workspace_id, scenario INTO v_workspace, v_scenario
    FROM public.financial_plan_sessions
   WHERE id = p_session_id
     FOR UPDATE;

  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_workspace_access(v_actor, v_workspace) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_existing
    FROM public.financial_model_versions
   WHERE session_id = p_session_id
     AND command_fingerprint = p_command_fingerprint
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, 'idempotent_reuse'::text;
    RETURN;
  END IF;

  INSERT INTO public.financial_model_versions(
    workspace_id, session_id, scenario_name, status, parse_status,
    assumptions_json, key_metrics_json, scoring_json, metadata_json,
    command_id, command_fingerprint, uploaded_by
  )
  VALUES (
    v_workspace, p_session_id,
    COALESCE(NULLIF(btrim(p_version_label), ''), 'Base'),
    'parsed', 'ok',
    COALESCE(p_assumptions, '{}'::jsonb),
    COALESCE(p_metrics, '{}'::jsonb),
    COALESCE(p_scoring, '{}'::jsonb),
    COALESCE(p_metadata, '{}'::jsonb),
    p_command_id, p_command_fingerprint, v_actor
  )
  RETURNING id INTO v_new;

  INSERT INTO public.financial_assumptions(
    workspace_id, version_id, scenario, key, value_json, value_numeric,
    source, owner_user_id
  )
  SELECT
    v_workspace, v_new, v_scenario, kv.key, kv.value,
    CASE WHEN jsonb_typeof(kv.value) = 'number'
         THEN (kv.value #>> '{}')::numeric END,
    'founder'::public.financial_assumption_source,
    v_actor
  FROM jsonb_each(COALESCE(p_assumptions, '{}'::jsonb)) kv;

  UPDATE public.financial_plan_sessions
     SET active_version_id = v_new, updated_at = now()
   WHERE id = p_session_id;

  RETURN QUERY SELECT v_new, 'created'::text;
END;
$function$;

-- 2. Program publishing: only deactivate siblings, never fail on an unrelated broken tree
CREATE OR REPLACE FUNCTION public.publish_program_atomic(p_program_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_type program_type; v_snapshot jsonb; v_snapshot_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice')) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT program_type INTO v_type FROM public.programs WHERE id = p_program_id FOR UPDATE;
  IF v_type IS NULL THEN RAISE EXCEPTION 'program_not_found' USING ERRCODE = 'P0002'; END IF;

  v_snapshot := public.serialize_program_tree(p_program_id);
  IF v_snapshot IS NULL THEN RAISE EXCEPTION 'snapshot_failed' USING ERRCODE = '23514'; END IF;

  INSERT INTO public.program_publish_snapshots(program_id, snapshot_json, reason, created_by)
    VALUES (p_program_id, v_snapshot, p_reason, auth.uid())
    RETURNING id INTO v_snapshot_id;

  -- Deactivate every other active program of the same type (there may be more than one).
  UPDATE public.programs
     SET is_active = false, updated_at = now()
   WHERE program_type = v_type AND is_active = true AND id <> p_program_id;

  UPDATE public.programs SET is_active = true, updated_at = now() WHERE id = p_program_id;
  RETURN v_snapshot_id;
END; $function$;

-- 3. Founder pulse cycles: skip archived workspaces
CREATE OR REPLACE FUNCTION public.open_monthly_founder_pulse_cycles()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inserted INTEGER := 0;
BEGIN
  IF NOT public.is_feature_flag_enabled('founder_monthly_pulse') THEN RETURN 0; END IF;
  INSERT INTO public.founder_pulse_cycles (workspace_id, period_month, status)
  SELECT w.id, date_trunc('month', now())::date, 'open'
    FROM public.workspaces w
   WHERE w.status = 'active' AND w.archived_at IS NULL
  ON CONFLICT (workspace_id, period_month) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END; $function$;

-- 4. Reconciler invariant alerts must dedupe (system_alerts has a unique dedupe_key)
CREATE OR REPLACE FUNCTION public.reconciler_commit_row(p_row_id uuid, p_expected_plan_hash text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.bulk_import_rows;
  v_batch_plan_hash text;
  v_kill_enabled boolean;
  v_funnel_item_id uuid;
  v_proposed_startup uuid;
  v_proposed_workspace uuid;
  v_request_hash text;
  v_existing public.reconciler_idempotency;
  v_result jsonb;
  v_verify record;
BEGIN
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT (value->>'enabled')::boolean INTO v_kill_enabled
    FROM public.system_settings WHERE key = 'reconciler.write_mode';
  IF NOT COALESCE(v_kill_enabled, false) THEN
    RAISE EXCEPTION 'writes_frozen' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.bulk_import_rows WHERE id = p_row_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'row_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reconciler:' || v_row.batch_id::text, 0));

  SELECT * INTO v_row FROM public.bulk_import_rows WHERE id = p_row_id FOR UPDATE;

  v_request_hash := encode(sha256(convert_to(
    p_expected_plan_hash || '|' || COALESCE(v_row.after_snapshot::text,''), 'UTF8')), 'hex');

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.reconciler_idempotency WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.request_hash <> v_request_hash THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '40001';
      END IF;
      RETURN v_existing.result;
    END IF;
  END IF;

  IF v_row.status <> 'dry_run_ok' THEN
    RAISE EXCEPTION 'row_not_stageable: status=%', v_row.status USING ERRCODE = '22023';
  END IF;

  SELECT plan_hash INTO v_batch_plan_hash
    FROM public.bulk_import_batches WHERE id = v_row.batch_id FOR UPDATE;
  IF v_batch_plan_hash IS NULL OR v_batch_plan_hash <> p_expected_plan_hash THEN
    RAISE EXCEPTION 'plan_hash_mismatch' USING ERRCODE = '40001';
  END IF;

  v_funnel_item_id := nullif(v_row.after_snapshot->>'funnel_item_id','')::uuid;
  v_proposed_startup := nullif(v_row.after_snapshot->>'proposed_startup_id','')::uuid;
  v_proposed_workspace := nullif(v_row.after_snapshot->>'proposed_workspace_id','')::uuid;

  IF v_funnel_item_id IS NULL THEN
    RAISE EXCEPTION 'missing_funnel_item_id' USING ERRCODE = '22023';
  END IF;

  UPDATE public.funnel_items
     SET linked_startup_id   = COALESCE(v_proposed_startup, linked_startup_id),
         linked_workspace_id = COALESCE(v_proposed_workspace, linked_workspace_id),
         updated_at = now()
   WHERE id = v_funnel_item_id;

  UPDATE public.bulk_import_rows
     SET status = 'committed',
         committed_at = now(),
         committed_by = v_actor,
         commit_authorized = true
   WHERE id = p_row_id;

  UPDATE public.bulk_import_batches
     SET committed_count = committed_count + 1,
         updated_at = now()
   WHERE id = v_row.batch_id;

  SELECT linked_startup_id, linked_workspace_id INTO v_verify
    FROM public.funnel_items WHERE id = v_funnel_item_id;

  IF v_proposed_startup IS NOT NULL AND v_verify.linked_startup_id IS DISTINCT FROM v_proposed_startup THEN
    INSERT INTO public.system_alerts (kind, severity, dedupe_key, payload)
    VALUES ('reconciler_invariant_failed', 'high',
      'reconciler_invariant_failed:' || p_row_id::text,
      jsonb_build_object('row_id', p_row_id, 'reason', 'linked_startup_mismatch',
                         'expected', v_proposed_startup, 'actual', v_verify.linked_startup_id))
    ON CONFLICT (dedupe_key) DO NOTHING;
    RAISE EXCEPTION 'invariant_failed_linked_startup' USING ERRCODE = '40001';
  END IF;

  v_result := jsonb_build_object(
    'row_id', p_row_id,
    'status', 'committed',
    'funnel_item_id', v_funnel_item_id,
    'linked_startup_id', v_proposed_startup,
    'linked_workspace_id', v_proposed_workspace,
    'idempotency_key', p_idempotency_key
  );

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.reconciler_idempotency(idempotency_key, batch_id, row_id, request_hash, result)
    VALUES (p_idempotency_key, v_row.batch_id, p_row_id, v_request_hash, v_result);
  END IF;

  RETURN v_result;
END;
$function$;

-- 5. Buildings: staff needed read access (only a manage policy existed)
DROP POLICY IF EXISTS "Authenticated users can view buildings" ON public.buildings;
CREATE POLICY "Authenticated users can view buildings"
ON public.buildings FOR SELECT TO authenticated
USING (true);
GRANT SELECT ON public.buildings TO authenticated;