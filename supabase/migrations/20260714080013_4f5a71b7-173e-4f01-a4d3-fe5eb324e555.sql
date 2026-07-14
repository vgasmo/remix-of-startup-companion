
-- Atomic single-row commit for CRM funnel items with external ID upsert.
-- SECURITY DEFINER so it can bypass RLS internally but restricted to
-- admin/backoffice by the caller check.
CREATE OR REPLACE FUNCTION public.commit_import_funnel_item(
  p_job_id UUID,
  p_row_id UUID,
  p_match_entity_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_payload JSONB,
  p_external_ids JSONB,
  p_final_stage TEXT,
  p_tags TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_existing RECORD;
  v_new_id UUID;
  v_before JSONB;
  v_after JSONB;
  v_action TEXT;
  v_ext RECORD;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'backoffice')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_match_entity_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.funnel_items WHERE id = p_match_entity_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'stale_match' USING ERRCODE = 'P0003';
    END IF;
    v_before := to_jsonb(v_existing);
    UPDATE public.funnel_items SET
      stage             = COALESCE(p_final_stage, stage),
      organization_name = COALESCE(NULLIF(p_payload->>'organization_name',''), organization_name),
      contact_name      = COALESCE(NULLIF(p_payload->>'contact_name',''), contact_name),
      contact_email     = COALESCE(NULLIF(p_payload->>'contact_email',''), contact_email),
      contact_phone     = COALESCE(NULLIF(p_payload->>'phone',''), contact_phone),
      program_id        = COALESCE((p_payload->>'program_id')::uuid, program_id),
      owner_consultant_id = COALESCE((p_payload->>'owner_consultant_id')::uuid, owner_consultant_id),
      tags              = CASE WHEN array_length(p_tags,1) IS NULL THEN tags
                               ELSE (SELECT array_agg(DISTINCT x) FROM unnest(coalesce(tags,'{}'::text[]) || p_tags) x) END,
      metadata_json     = coalesce(metadata_json,'{}'::jsonb) || COALESCE(p_payload->'metadata_json','{}'::jsonb),
      updated_at        = v_now,
      last_activity_at  = v_now
    WHERE id = p_match_entity_id
    RETURNING id INTO v_new_id;
    v_action := 'update';
  ELSE
    INSERT INTO public.funnel_items(
      stage, type, organization_name, contact_name, contact_email, contact_phone,
      program_id, owner_consultant_id, source, tags, notes, metadata_json,
      first_contact_at, last_activity_at
    ) VALUES (
      COALESCE(p_final_stage,'new'),
      COALESCE(p_payload->>'type','startup'),
      NULLIF(p_payload->>'organization_name',''),
      NULLIF(p_payload->>'contact_name',''),
      NULLIF(p_payload->>'contact_email',''),
      NULLIF(p_payload->>'phone',''),
      (p_payload->>'program_id')::uuid,
      (p_payload->>'owner_consultant_id')::uuid,
      'hubspot_import',
      COALESCE(p_tags,'{}'::text[]),
      p_payload->>'notes',
      COALESCE(p_payload->'metadata_json','{}'::jsonb),
      v_now, v_now
    ) RETURNING id INTO v_new_id;
    v_before := NULL;
    v_action := 'insert';
  END IF;

  -- Upsert external references (deal / company / contact / owner)
  FOR v_ext IN SELECT * FROM jsonb_each_text(p_external_ids) LOOP
    IF v_ext.value IS NOT NULL AND v_ext.value <> '' THEN
      INSERT INTO public.external_entity_refs(provider, object_type, external_id, internal_entity_type, internal_entity_id, metadata_json)
      VALUES ('hubspot', v_ext.key, v_ext.value, 'funnel_item', v_new_id, jsonb_build_object('job_id', p_job_id, 'row_id', p_row_id))
      ON CONFLICT (provider, object_type, external_id) DO UPDATE
        SET internal_entity_type = EXCLUDED.internal_entity_type,
            internal_entity_id   = EXCLUDED.internal_entity_id,
            metadata_json        = external_entity_refs.metadata_json || EXCLUDED.metadata_json,
            updated_at           = v_now;
    END IF;
  END LOOP;

  SELECT to_jsonb(fi.*) INTO v_after FROM public.funnel_items fi WHERE id = v_new_id;

  RETURN jsonb_build_object(
    'action', v_action,
    'entity_id', v_new_id,
    'before', v_before,
    'after', v_after
  );
END $$;

REVOKE ALL ON FUNCTION public.commit_import_funnel_item(UUID,UUID,UUID,TIMESTAMPTZ,JSONB,JSONB,TEXT,TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_import_funnel_item(UUID,UUID,UUID,TIMESTAMPTZ,JSONB,JSONB,TEXT,TEXT[]) TO authenticated, service_role;


-- Revert a previously committed import row. Only deletes rows that this
-- import inserted and that have no downstream references.
CREATE OR REPLACE FUNCTION public.revert_import_row(p_row_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row RECORD;
  v_entity_id UUID;
  v_action TEXT;
BEGIN
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.data_import_rows WHERE id = p_row_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'row_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.approval_state <> 'committed' THEN
    RAISE EXCEPTION 'row_not_committed' USING ERRCODE = 'P0003';
  END IF;

  v_entity_id := (v_row.commit_result_json->>'entity_id')::uuid;
  v_action := v_row.commit_result_json->>'action';

  IF v_action = 'insert' AND v_entity_id IS NOT NULL THEN
    -- Guard: only delete when nothing else references this funnel item.
    IF EXISTS (SELECT 1 FROM public.startups WHERE id = (SELECT linked_startup_id FROM public.funnel_items WHERE id = v_entity_id))
       OR EXISTS (SELECT 1 FROM public.workspaces WHERE id = (SELECT linked_workspace_id FROM public.funnel_items WHERE id = v_entity_id))
    THEN
      RAISE EXCEPTION 'has_dependencies' USING ERRCODE = 'P0004';
    END IF;
    DELETE FROM public.external_entity_refs WHERE internal_entity_type='funnel_item' AND internal_entity_id = v_entity_id;
    DELETE FROM public.funnel_items WHERE id = v_entity_id;
  ELSIF v_action = 'update' AND v_row.commit_result_json ? 'before' AND v_row.commit_result_json->'before' IS NOT NULL THEN
    -- Restore known before-snapshot for a small allowlist of fields.
    UPDATE public.funnel_items SET
      stage             = COALESCE(v_row.commit_result_json->'before'->>'stage', stage),
      organization_name = v_row.commit_result_json->'before'->>'organization_name',
      contact_name      = v_row.commit_result_json->'before'->>'contact_name',
      contact_email     = v_row.commit_result_json->'before'->>'contact_email',
      contact_phone     = v_row.commit_result_json->'before'->>'contact_phone',
      tags              = ARRAY(SELECT jsonb_array_elements_text(v_row.commit_result_json->'before'->'tags')),
      updated_at        = now()
    WHERE id = v_entity_id;
  ELSE
    RAISE EXCEPTION 'unsupported_action' USING ERRCODE = 'P0005';
  END IF;

  UPDATE public.data_import_rows SET approval_state = 'reverted', commit_result_json = commit_result_json || jsonb_build_object('reverted_at', now()) WHERE id = p_row_id;

  RETURN jsonb_build_object('ok', true, 'entity_id', v_entity_id, 'action', v_action);
END $$;

REVOKE ALL ON FUNCTION public.revert_import_row(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_import_row(UUID) TO authenticated, service_role;
