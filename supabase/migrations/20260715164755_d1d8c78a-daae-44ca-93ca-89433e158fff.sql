
-- Phase 1: Safe reconciliation schema + RPCs

-- 1. Workspaces: add unique nullable phc_customer_id
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS phc_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_phc_customer_id_key
  ON public.workspaces (phc_customer_id)
  WHERE phc_customer_id IS NOT NULL;

-- 2. bulk_import_rows: add idempotency, error, rollback timestamp
ALTER TABLE public.bulk_import_rows
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS error jsonb,
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS bulk_import_rows_idempotency_key_uidx
  ON public.bulk_import_rows (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. reconcile_active_customer RPC
--    Stages one PHC record. Refuses to auto-create users, memberships,
--    invitations, or notifications. Ambiguous matches -> status='conflict'.
--    Never commits business writes; commits happen via reconciler-run
--    edge function after admin authorization.
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
  v_nif text := regexp_replace(coalesce(p_input->>'nif',''), '[^0-9]', '', 'g');
  v_hubspot_id text := nullif(p_input->>'hubspot_company_id','');
  v_service text := nullif(p_input->>'service_name','');
  v_org text := nullif(p_input->>'organization_name','');
  v_status text := lower(coalesce(p_input->>'status',''));
  v_key uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_existing public.bulk_import_rows;
  v_matches int;
  v_startup_id uuid;
  v_workspace_id uuid;
  v_programme_id uuid;
  v_service_class text;
  v_row_status text := 'ready';
  v_error jsonb := NULL;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_row_id uuid;
BEGIN
  -- Admin gate
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Idempotency: return prior result if same key already exists
  SELECT * INTO v_existing FROM public.bulk_import_rows
    WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'row_id', v_existing.id,
      'status', v_existing.status,
      'idempotent', true,
      'after_snapshot', v_existing.after_snapshot
    );
  END IF;

  -- Exclude archived/rejected PHC states
  IF v_status IN ('archived','rejected','inactive','cancelled') THEN
    v_row_status := 'excluded';
    v_error := jsonb_build_object('reason','phc_status_excluded','value',v_status);
  END IF;

  -- Match precedence: phc_customer_id -> nif -> hubspot
  IF v_row_status = 'ready' AND v_phc_id IS NOT NULL THEN
    SELECT count(*) INTO v_matches FROM public.startups
      WHERE phc_customer_id = v_phc_id;
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

  -- Service classification & programme mapping
  IF v_row_status = 'ready' THEN
    IF v_service IS NULL THEN
      v_row_status := 'conflict';
      v_error := jsonb_build_object('reason','missing_service');
    ELSE
      v_service_class := coalesce(p_service_program_map -> v_service ->> 'classification','unknown');
      v_programme_id := nullif(p_service_program_map -> v_service ->> 'programme_id','')::uuid;
      IF v_service_class = 'unknown' THEN
        v_row_status := 'conflict';
        v_error := jsonb_build_object('reason','unmapped_service','value',v_service);
      ELSIF v_service_class IN ('founder_journey','mixed') AND v_programme_id IS NULL THEN
        v_row_status := 'conflict';
        v_error := jsonb_build_object('reason','missing_programme_id','service',v_service);
      END IF;
    END IF;
  END IF;

  -- Locate workspace if startup already known
  IF v_startup_id IS NOT NULL THEN
    SELECT id INTO v_workspace_id FROM public.workspaces
      WHERE startup_id = v_startup_id
      ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Build before/after snapshots (read-only staging, no writes here)
  v_before := jsonb_build_object(
    'startup_id', v_startup_id,
    'workspace_id', v_workspace_id
  );
  v_after := jsonb_build_object(
    'proposed_startup_id', v_startup_id,
    'proposed_workspace_id', v_workspace_id,
    'proposed_phc_customer_id', v_phc_id,
    'proposed_service', v_service,
    'proposed_service_classification', v_service_class,
    'proposed_programme_id', v_programme_id,
    'proposed_organization_name', v_org
  );

  IF v_row_status = 'ready' THEN
    v_row_status := 'dry_run_ok';
  END IF;

  -- Persist staging row
  INSERT INTO public.bulk_import_rows (
    batch_id, status, idempotency_key,
    before_snapshot, after_snapshot, error,
    matched_startup_id, matched_workspace_id,
    extracted_json, edited_json
  ) VALUES (
    p_batch_id, v_row_status, v_key,
    v_before, v_after, v_error,
    v_startup_id, v_workspace_id,
    p_input, p_input
  )
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object(
    'row_id', v_row_id,
    'status', v_row_status,
    'idempotent', false,
    'error', v_error,
    'after_snapshot', v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_active_customer(uuid, jsonb, jsonb, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reconcile_active_customer(uuid, jsonb, jsonb, uuid) TO authenticated;

-- 4. reconcile_rollback: restore before_snapshot, mark rolled_back
CREATE OR REPLACE FUNCTION public.reconcile_rollback(p_row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.bulk_import_rows;
BEGIN
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.bulk_import_rows WHERE id = p_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'row_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'committed' THEN
    RETURN jsonb_build_object('row_id', p_row_id, 'status', v_row.status, 'noop', true);
  END IF;

  -- Restoration is a policy decision executed by the reconciler-run edge
  -- function using the service role; here we only flip the marker so the
  -- edge function can idempotently process the rollback queue.
  UPDATE public.bulk_import_rows
    SET status = 'rolled_back',
        rolled_back_at = now()
    WHERE id = p_row_id;

  RETURN jsonb_build_object('row_id', p_row_id, 'status', 'rolled_back');
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_rollback(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reconcile_rollback(uuid) TO authenticated;
