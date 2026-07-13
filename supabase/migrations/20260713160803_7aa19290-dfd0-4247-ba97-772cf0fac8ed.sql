-- ─── 1. Soft-archive column on definitions ───
ALTER TABLE public.survey_definitions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_survey_definitions_archived
  ON public.survey_definitions (archived_at) WHERE archived_at IS NULL;

-- ─── 2. Copy-on-write columns on campaigns ───
ALTER TABLE public.survey_campaigns
  ADD COLUMN IF NOT EXISTS questions_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS definition_version_at_launch TIMESTAMPTZ;

-- ─── 3. Change FK from CASCADE to RESTRICT ───
-- Deleting a definition that has any campaign is now blocked; use archive.
ALTER TABLE public.survey_campaigns
  DROP CONSTRAINT IF EXISTS survey_campaigns_survey_definition_id_fkey;

ALTER TABLE public.survey_campaigns
  ADD CONSTRAINT survey_campaigns_survey_definition_id_fkey
  FOREIGN KEY (survey_definition_id)
  REFERENCES public.survey_definitions(id)
  ON DELETE RESTRICT;

-- ─── 4. Backfill snapshot for already-launched campaigns so downstream reads
--     can uniformly prefer questions_snapshot ───
UPDATE public.survey_campaigns c
   SET questions_snapshot = d.questions_json,
       launched_at = COALESCE(c.launched_at, c.created_at),
       definition_version_at_launch = COALESCE(c.definition_version_at_launch, d.updated_at)
  FROM public.survey_definitions d
 WHERE c.survey_definition_id = d.id
   AND c.status IN ('active','closed','archived')
   AND c.questions_snapshot IS NULL;

-- ─── 5. RPC: launch_survey_campaign (staff, atomic) ───
CREATE OR REPLACE FUNCTION public.launch_survey_campaign(
  p_campaign_id UUID,
  p_workspace_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(campaign_id UUID, instances_created INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.survey_campaigns%ROWTYPE;
  v_definition public.survey_definitions%ROWTYPE;
  v_created INT := 0;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campaign FROM public.survey_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_campaign.status <> 'draft' THEN
    RAISE EXCEPTION 'campaign is not in draft state (status=%)', v_campaign.status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_definition FROM public.survey_definitions WHERE id = v_campaign.survey_definition_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'definition not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_definition.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'cannot launch: template is archived' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(jsonb_array_length(v_definition.questions_json), 0) = 0 THEN
    RAISE EXCEPTION 'cannot launch: template has no questions' USING ERRCODE = '22023';
  END IF;

  -- Copy-on-write snapshot BEFORE creating instances.
  UPDATE public.survey_campaigns
     SET questions_snapshot = v_definition.questions_json,
         definition_version_at_launch = v_definition.updated_at,
         launched_at = now(),
         status = 'active'
   WHERE id = p_campaign_id;

  -- Create instances. If p_workspace_ids is null, target all active workspaces
  -- (optionally filtered by campaign.program_id).
  WITH targets AS (
    SELECT w.id AS workspace_id, w.stage, s.name AS startup_name, s.founded_date
      FROM public.workspaces w
      LEFT JOIN public.startups s ON s.id = w.startup_id
     WHERE w.status = 'active'
       AND (p_workspace_ids IS NULL OR w.id = ANY(p_workspace_ids))
       AND (v_campaign.program_id IS NULL OR w.program_id = v_campaign.program_id)
  ),
  inserted AS (
    INSERT INTO public.survey_instances (campaign_id, workspace_id, status, auto_filled_data)
    SELECT p_campaign_id,
           t.workspace_id,
           'pending',
           jsonb_build_object(
             'stage', t.stage,
             'startup_name', t.startup_name,
             'founded_year', CASE WHEN t.founded_date IS NOT NULL
                                  THEN EXTRACT(YEAR FROM t.founded_date)::int
                                  ELSE NULL END
           )
      FROM targets t
      ON CONFLICT (campaign_id, workspace_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_created FROM inserted;

  RETURN QUERY SELECT p_campaign_id, v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.launch_survey_campaign(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.launch_survey_campaign(UUID, UUID[]) TO authenticated;

-- ─── 6. RPC: submit_survey_responses (founder, atomic) ───
CREATE OR REPLACE FUNCTION public.submit_survey_responses(
  p_instance_id UUID,
  p_responses JSONB,       -- array: [{question_id, response_value?, response_json?, is_auto_filled?}]
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
GRANT EXECUTE ON FUNCTION public.submit_survey_responses(UUID, JSONB, BOOLEAN) TO authenticated;

-- ─── 7. Unique key needed by ON CONFLICT (safety: create if missing) ───
CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_instance_question_key
  ON public.survey_responses (instance_id, question_id);