
-- Idempotency table
CREATE TABLE IF NOT EXISTS public.reconciler_idempotency (
  idempotency_key uuid PRIMARY KEY,
  batch_id uuid NOT NULL,
  row_id uuid NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reconciler_idempotency TO authenticated;
GRANT ALL ON public.reconciler_idempotency TO service_role;

ALTER TABLE public.reconciler_idempotency ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reconciler_idempotency' AND policyname='reconciler_idempotency_admin_read') THEN
    CREATE POLICY "reconciler_idempotency_admin_read" ON public.reconciler_idempotency
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reconciler_idempotency_batch ON public.reconciler_idempotency(batch_id);
CREATE INDEX IF NOT EXISTS idx_reconciler_idempotency_row ON public.reconciler_idempotency(row_id);

-- Upgraded commit function: advisory xact lock, idempotency, post-write invariant check, alerting
CREATE OR REPLACE FUNCTION public.reconciler_commit_row(
  p_row_id uuid,
  p_expected_plan_hash text,
  p_idempotency_key uuid DEFAULT NULL
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

  -- Advisory transaction lock per (reconciler, batch) via row->batch
  SELECT * INTO v_row FROM public.bulk_import_rows WHERE id = p_row_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'row_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reconciler:' || v_row.batch_id::text, 0));

  -- Now re-lock the row FOR UPDATE
  SELECT * INTO v_row FROM public.bulk_import_rows WHERE id = p_row_id FOR UPDATE;

  v_request_hash := encode(sha256(convert_to(
    p_expected_plan_hash || '|' || COALESCE(v_row.after_snapshot::text,''), 'UTF8')), 'hex');

  -- Idempotency replay
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

  -- Post-write invariant verification
  SELECT linked_startup_id, linked_workspace_id INTO v_verify
    FROM public.funnel_items WHERE id = v_funnel_item_id;

  IF v_proposed_startup IS NOT NULL AND v_verify.linked_startup_id IS DISTINCT FROM v_proposed_startup THEN
    -- Record alert and abort
    INSERT INTO public.system_alerts (kind, severity, payload)
    VALUES ('reconciler_invariant_failed', 'high',
      jsonb_build_object('row_id', p_row_id, 'reason', 'linked_startup_mismatch',
                         'expected', v_proposed_startup, 'actual', v_verify.linked_startup_id));
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
$$;

REVOKE ALL ON FUNCTION public.reconciler_commit_row(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconciler_commit_row(uuid, text, uuid) TO authenticated;
