-- Batch F5 — Business Plan & Financial Plan assistants
-- Forward-only, additive, idempotent. Held as draft.
--
-- One atomic RPC persists (assumptions + metrics + scoring + metadata) for a
-- Save-As-Scenario. Fingerprint-bound to prevent duplicate sibling scenarios
-- from double-clicks.

BEGIN;

ALTER TABLE public.financial_model_versions
  ADD COLUMN IF NOT EXISTS command_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fmv_command_fingerprint
  ON public.financial_model_versions (session_id, command_fingerprint)
  WHERE command_fingerprint IS NOT NULL;

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
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_existing uuid;
  v_new uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  SELECT workspace_id INTO v_workspace
    FROM public.financial_plan_sessions
   WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_workspace_access(v_workspace, v_actor) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Idempotent replay: same fingerprint on the same session returns the
  -- previously persisted version instead of creating a sibling.
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
    session_id, workspace_id, label,
    assumptions_json, metrics_json, scoring_json, metadata_json,
    command_id, command_fingerprint, created_by
  )
  VALUES (
    p_session_id, v_workspace, p_version_label,
    COALESCE(p_assumptions,'{}'::jsonb),
    COALESCE(p_metrics,'{}'::jsonb),
    COALESCE(p_scoring,'{}'::jsonb),
    COALESCE(p_metadata,'{}'::jsonb),
    p_command_id, p_command_fingerprint, v_actor
  )
  RETURNING id INTO v_new;

  -- Snapshot assumption rows for exact clone (no read-side recompute drift).
  INSERT INTO public.financial_assumptions(
    session_id, version_id, key, value_json, is_locked, created_by
  )
  SELECT p_session_id, v_new, kv.key, kv.value, false, v_actor
    FROM jsonb_each(COALESCE(p_assumptions,'{}'::jsonb)) kv;

  RETURN QUERY SELECT v_new, 'created'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.save_financial_scenario_atomic(
  uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_financial_scenario_atomic(
  uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, text) TO authenticated;

COMMIT;
