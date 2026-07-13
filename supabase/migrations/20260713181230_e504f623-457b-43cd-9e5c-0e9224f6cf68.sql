-- Phase 2 batch 1 — survey reliability: server-side campaign snapshot validation.
--
-- submit_survey_responses previously accepted any question_id string. This
-- means a client bug (or a stale in-flight tab after a snapshot change) could
-- persist orphan responses for question ids that don't exist in the campaign's
-- frozen snapshot, breaking analytics and export.
--
-- We now:
--  1. Require the campaign to have a snapshot (launched campaigns always do —
--     drafts cannot receive submissions since submit already rejects
--     non-active status).
--  2. Filter incoming responses to only those whose question_id is present in
--     the snapshot. Extra ids are silently dropped (not raised) so a partial
--     save from a slightly-stale client still persists valid answers.
--  3. Return the number of accepted responses so the client can surface a
--     "N answers saved, M ignored (stale question)" toast.

CREATE OR REPLACE FUNCTION public.submit_survey_responses(
  p_instance_id UUID,
  p_responses JSONB,
  p_submit BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(instance_id UUID, status TEXT, responses_saved INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance public.survey_instances%ROWTYPE;
  v_campaign public.survey_campaigns%ROWTYPE;
  v_valid_ids TEXT[];
  v_saved INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'permission denied: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_instance FROM public.survey_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'instance not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (is_staff() OR has_workspace_access(v_instance.workspace_id)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF v_instance.status = 'submitted' THEN
    RAISE EXCEPTION 'survey already submitted' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign FROM public.survey_campaigns WHERE id = v_instance.campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'cannot save responses: campaign is % (must be active)', v_campaign.status
      USING ERRCODE = '22023';
  END IF;

  -- Build the whitelist of valid question ids from the launch-time snapshot.
  -- Falls back to the current definition only if a legacy pre-snapshot
  -- campaign somehow reaches submit (should be impossible after launch RPC).
  IF v_campaign.questions_snapshot IS NOT NULL
     AND jsonb_typeof(v_campaign.questions_snapshot) = 'array' THEN
    SELECT ARRAY(
      SELECT (q->>'id')::text
        FROM jsonb_array_elements(v_campaign.questions_snapshot) q
       WHERE q->>'id' IS NOT NULL
    ) INTO v_valid_ids;
  ELSE
    SELECT ARRAY(
      SELECT (q->>'id')::text
        FROM public.survey_definitions d,
             jsonb_array_elements(d.questions_json) q
       WHERE d.id = v_campaign.survey_definition_id
         AND q->>'id' IS NOT NULL
    ) INTO v_valid_ids;
  END IF;

  IF p_responses IS NOT NULL AND jsonb_typeof(p_responses) = 'array' THEN
    WITH input AS (
      SELECT jsonb_array_elements(p_responses) AS r
    ),
    ups AS (
      INSERT INTO public.survey_responses (
        instance_id, question_id, response_value, response_json, is_auto_filled
      )
      SELECT p_instance_id,
             (r->>'question_id')::text,
             NULLIF(r->>'response_value',''),
             CASE WHEN r ? 'response_json' THEN r->'response_json' ELSE NULL END,
             COALESCE((r->>'is_auto_filled')::boolean, false)
        FROM input
       WHERE (r->>'question_id') IS NOT NULL
         AND (r->>'question_id') = ANY(v_valid_ids)
      ON CONFLICT (instance_id, question_id)
      DO UPDATE SET response_value = EXCLUDED.response_value,
                    response_json = EXCLUDED.response_json,
                    is_auto_filled = EXCLUDED.is_auto_filled,
                    updated_at = now()
      RETURNING 1
    )
    SELECT COUNT(*)::int INTO v_saved FROM ups;
  END IF;

  UPDATE public.survey_instances
     SET status = CASE WHEN p_submit THEN 'submitted' ELSE 'in_progress' END,
         submitted_at = CASE WHEN p_submit THEN now() ELSE submitted_at END,
         submitted_by = CASE WHEN p_submit THEN auth.uid() ELSE submitted_by END
   WHERE id = p_instance_id;

  RETURN QUERY
    SELECT p_instance_id,
           CASE WHEN p_submit THEN 'submitted'::text ELSE 'in_progress'::text END,
           v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_survey_responses(UUID, JSONB, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_survey_responses(UUID, JSONB, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_survey_responses(UUID, JSONB, BOOLEAN) TO authenticated;