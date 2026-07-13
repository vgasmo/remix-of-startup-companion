
-- 1. Optimistic-locking revision column.
ALTER TABLE public.program_setup_drafts
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

-- 2. Revision-aware patch RPC. Shallow-merges p_patch into draft_json,
--    increments revision, or returns a conflict payload if the caller's
--    expected revision no longer matches (another tab saved first).
CREATE OR REPLACE FUNCTION public.patch_program_setup(
  p_draft_id uuid,
  p_expected_revision integer,
  p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current_revision integer;
  v_current_json jsonb;
  v_current_status text;
  v_new_revision integer;
  v_new_json jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'consultor'::app_role)) THEN
    RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
  END IF;

  IF p_draft_id IS NULL OR p_patch IS NULL THEN
    RAISE EXCEPTION 'draft_id and patch are required';
  END IF;

  -- Lock the draft row so concurrent patches on the same draft serialize.
  SELECT revision, draft_json, status
    INTO v_current_revision, v_current_json, v_current_status
  FROM public.program_setup_drafts
  WHERE id = p_draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft % not found', p_draft_id USING ERRCODE = 'P0002';
  END IF;

  -- Refuse patches on drafts that have moved out of an editable state.
  IF v_current_status NOT IN ('draft', 'publish_failed') THEN
    RAISE EXCEPTION 'Draft is % and cannot be patched', v_current_status USING ERRCODE = '55000';
  END IF;

  -- Optimistic-lock check. NULL means "caller opts out" (first save / not tracked).
  IF p_expected_revision IS NOT NULL AND p_expected_revision <> v_current_revision THEN
    RETURN jsonb_build_object(
      'conflict', true,
      'current_revision', v_current_revision,
      'current_draft_json', v_current_json
    );
  END IF;

  v_new_json := COALESCE(v_current_json, '{}'::jsonb) || p_patch;
  v_new_revision := v_current_revision + 1;

  UPDATE public.program_setup_drafts SET
    draft_json = v_new_json,
    revision   = v_new_revision,
    updated_at = now()
  WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'conflict', false,
    'revision', v_new_revision,
    'updated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.patch_program_setup(uuid, integer, jsonb)
IS 'Revision-aware shallow merge of a patch into program_setup_drafts.draft_json. Returns {conflict:true, current_revision, current_draft_json} if the expected revision is stale; otherwise increments revision and merges. Staff-only.';

REVOKE ALL ON FUNCTION public.patch_program_setup(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patch_program_setup(uuid, integer, jsonb) TO authenticated, service_role;
