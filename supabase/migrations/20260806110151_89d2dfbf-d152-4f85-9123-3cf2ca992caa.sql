-- Batch F5 — atomic "Save as scenario" for the guided financial plan.
-- Forward-only, additive, idempotent. Column set matches the live table
-- (the held draft assumed columns that never existed).

ALTER TABLE public.financial_model_versions
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.financial_plan_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assumptions_json jsonb,
  ADD COLUMN IF NOT EXISTS scoring_json jsonb,
  ADD COLUMN IF NOT EXISTS metadata_json jsonb,
  ADD COLUMN IF NOT EXISTS command_id uuid,
  ADD COLUMN IF NOT EXISTS command_fingerprint text;

-- Guided-plan scenarios are generated in-app and have no uploaded workbook.
ALTER TABLE public.financial_model_versions
  ALTER COLUMN document_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fmv_command_fingerprint
  ON public.financial_model_versions (session_id, command_fingerprint)
  WHERE command_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fmv_session ON public.financial_model_versions (session_id);

CREATE OR REPLACE FUNCTION public.save_financial_scenario_atomic(
  p_session_id uuid,
  p_version_label text,
  p_assumptions jsonb,
  p_metrics jsonb,
  p_scoring jsonb,
  p_metadata jsonb,
  p_command_id uuid,
  p_command_fingerprint text
)
RETURNS TABLE(version_id uuid, mode text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
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

  IF NOT public.has_workspace_access(v_workspace, v_actor) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Idempotent replay: the same fingerprint on the same session returns the
  -- version already persisted instead of creating a duplicate sibling.
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

  -- Snapshot the assumption rows so a clone reads the exact saved state
  -- instead of recomputing it later.
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
$fn$;

REVOKE ALL ON FUNCTION public.save_financial_scenario_atomic(
  uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_financial_scenario_atomic(
  uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.save_financial_scenario_atomic(
  uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, text) IS
  'Batch F5: single-transaction Save-As-Scenario. Workspace-access checked, session-locked, fingerprint-idempotent.';