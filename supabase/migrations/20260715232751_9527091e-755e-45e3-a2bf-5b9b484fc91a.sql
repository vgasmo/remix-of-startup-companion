
-- Reconciler staged-commit protocol
-- Adds plan_hash to bulk_import_batches, allows nullable pdf_path/filename for
-- reconciler staging rows, and defines two SECURITY DEFINER functions:
--   1) reconcile_active_customer  — stage-only, restores the RPC dropped by 20260715202735
--   2) reconciler_commit_row      — atomic per-row commit, requires plan_hash match + kill-switch

ALTER TABLE public.bulk_import_batches
  ADD COLUMN IF NOT EXISTS plan_hash text;

ALTER TABLE public.bulk_import_rows
  ALTER COLUMN pdf_path DROP NOT NULL,
  ALTER COLUMN pdf_filename DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bulk_import_rows_batch_status
  ON public.bulk_import_rows (batch_id, status);

-- Staging RPC: never writes business tables. Restored from migration 20260715164755.
CREATE OR REPLACE FUNCTION public.reconcile_active_customer(
  p_batch_id uuid,
  p_input jsonb,
  p_service_program_map jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_phc_id text := nullif(p_input->>'phc_customer_id','');
  v_nif text := regexp_replace(coalesce(p_input->>'nif_normalized', p_input->>'nif',''), '[^0-9]', '', 'g');
  v_hubspot_id text := nullif(p_input->>'hubspot_company_id','');
  v_service text := nullif(p_input->>'service_name','');
  v_service_class text := nullif(p_input->>'service_classification','');
  v_programme_id uuid := nullif(p_input->>'program_id','')::uuid;
  v_funnel_item_id uuid := nullif(p_input->>'funnel_item_id','')::uuid;
  v_org text := nullif(p_input->>'organization_name','');
  v_key uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_existing public.bulk_import_rows;
  v_matches int;
  v_startup_id uuid;
  v_workspace_id uuid;
  v_row_status text := 'ready';
  v_error jsonb := NULL;
  v_before jsonb;
  v_after jsonb;
  v_row_id uuid;
BEGIN
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing FROM public.bulk_import_rows WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('row_id', v_existing.id, 'status', v_existing.status, 'idempotent', true, 'after_snapshot', v_existing.after_snapshot);
  END IF;

  -- Match precedence: phc_customer_id -> nif -> hubspot
  IF v_phc_id IS NOT NULL THEN
    SELECT count(*) INTO v_matches FROM public.startups WHERE phc_customer_id = v_phc_id;
    IF v_matches > 1 THEN
      v_row_status := 'conflict';
      v_error := jsonb_build_object('reason','ambiguous_phc_id','value',v_phc_id,'matches',v_matches);
    ELSIF v_matches = 1 THEN
      SELECT id INTO v_startup_id FROM public.startups WHERE phc_customer_id = v_phc_id;
    END IF;
  END IF;

  IF v_row_status = 'ready' AND v_startup_id IS NULL AND v_nif <> '' THEN
    SELECT count(*) INTO v_matches FROM public.startups
      WHERE regexp_replace(coalesce(nif,''), '[^0-9]', '', 'g') = v_nif;
    IF v_matches > 1 THEN
      v_row_status := 'conflict';
      v_error := jsonb_build_object('reason','ambiguous_nif','value',v_nif,'matches',v_matches);
    ELSIF v_matches = 1 THEN
      SELECT id INTO v_startup_id FROM public.startups
        WHERE regexp_replace(coalesce(nif,''), '[^0-9]', '', 'g') = v_nif;
    END IF;
  END IF;

  IF v_row_status = 'ready' THEN
    IF v_service_class IS NULL OR v_service_class NOT IN ('founder_journey','domiciliacao','mixed') THEN
      v_row_status := 'conflict';
      v_error := jsonb_build_object('reason','unmapped_service_classification','service',v_service);
    ELSIF v_service_class IN ('founder_journey','mixed') AND v_programme_id IS NULL THEN
      v_row_status := 'conflict';
      v_error := jsonb_build_object('reason','programme_id_required','service',v_service);
    END IF;
  END IF;

  IF v_startup_id IS NOT NULL THEN
    SELECT id INTO v_workspace_id FROM public.workspaces
      WHERE startup_id = v_startup_id
      ORDER BY created_at ASC LIMIT 1;
  END IF;

  v_before := jsonb_build_object('startup_id', v_startup_id, 'workspace_id', v_workspace_id);
  v_after := jsonb_build_object(
    'funnel_item_id', v_funnel_item_id,
    'proposed_startup_id', v_startup_id,
    'proposed_workspace_id', v_workspace_id,
    'proposed_phc_customer_id', v_phc_id,
    'proposed_service', v_service,
    'proposed_service_classification', v_service_class,
    'proposed_programme_id', v_programme_id,
    'proposed_organization_name', v_org
  );

  IF v_row_status = 'ready' THEN v_row_status := 'dry_run_ok'; END IF;

  INSERT INTO public.bulk_import_rows (
    batch_id, status, idempotency_key,
    before_snapshot, after_snapshot, error,
    matched_startup_id, matched_workspace_id,
    extracted_json, edited_json,
    pdf_path, pdf_filename
  ) VALUES (
    p_batch_id, v_row_status, v_key,
    v_before, v_after, v_error,
    v_startup_id, v_workspace_id,
    p_input, p_input,
    NULL, NULL
  ) RETURNING id INTO v_row_id;

  RETURN jsonb_build_object('row_id', v_row_id, 'status', v_row_status, 'idempotent', false, 'error', v_error, 'after_snapshot', v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_active_customer(uuid, jsonb, jsonb, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reconcile_active_customer(uuid, jsonb, jsonb, uuid) TO authenticated;

-- Atomic commit RPC: applies one staged row, guarded by plan_hash + kill-switch.
CREATE OR REPLACE FUNCTION public.reconciler_commit_row(
  p_row_id uuid,
  p_expected_plan_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.bulk_import_rows;
  v_batch_plan_hash text;
  v_kill_enabled boolean;
  v_funnel_item_id uuid;
  v_proposed_startup uuid;
  v_proposed_workspace uuid;
BEGIN
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Kill-switch (DB side)
  SELECT (value->>'enabled')::boolean INTO v_kill_enabled
  FROM public.system_settings WHERE key = 'reconciler.write_mode';
  IF NOT COALESCE(v_kill_enabled, false) THEN
    RAISE EXCEPTION 'writes_frozen' USING ERRCODE = '42501';
  END IF;

  -- Lock the row
  SELECT * INTO v_row FROM public.bulk_import_rows WHERE id = p_row_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'row_not_found' USING ERRCODE = 'P0002'; END IF;

  IF v_row.status <> 'dry_run_ok' THEN
    RAISE EXCEPTION 'row_not_stageable: status=%', v_row.status USING ERRCODE = '22023';
  END IF;

  -- Lock the batch, verify plan_hash
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

  -- Apply linkage (never creates users, memberships, invitations, notifications)
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

  -- Update batch counters
  UPDATE public.bulk_import_batches
     SET committed_count = committed_count + 1,
         updated_at = now()
   WHERE id = v_row.batch_id;

  RETURN jsonb_build_object(
    'row_id', p_row_id,
    'status', 'committed',
    'funnel_item_id', v_funnel_item_id,
    'linked_startup_id', v_proposed_startup,
    'linked_workspace_id', v_proposed_workspace
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconciler_commit_row(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reconciler_commit_row(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reconciler_commit_row(uuid, text) IS
'Atomic per-row commit for the reconciler staged-commit protocol. Requires: admin caller, kill-switch enabled, row.status=dry_run_ok, and batch.plan_hash matches expected. Never creates users, memberships, invitations, or notifications.';
