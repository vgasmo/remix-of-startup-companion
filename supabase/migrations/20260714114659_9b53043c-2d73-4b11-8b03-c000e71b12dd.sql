
CREATE OR REPLACE FUNCTION public.admin_commit_crm_import_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.data_import_jobs%ROWTYPE;
  v_row public.data_import_rows%ROWTYPE;
  v_config jsonb;
  v_source text;
  v_forbidden text[] := ARRAY['create_startups','create_workspaces','create_contract_proposals','create_users','create_invitations','create_notifications','run_automations','send_invitations','send_notifications','trigger_automations','start_playbooks'];
  v_key text;
  v_toggles jsonb;
  v_n jsonb;
  v_payload jsonb;
  v_external_ids jsonb;
  v_tags text[];
  v_metadata jsonb;
  v_stage text;
  v_type text;
  v_attach_hs boolean;
  v_match_id uuid;
  v_match_reason text;
  v_conflict boolean;
  v_candidate uuid;
  v_committed int := 0; v_inserted int := 0; v_updated int := 0;
  v_failed int := 0; v_conflicts int := 0; v_skipped int := 0;
BEGIN
  SELECT * INTO v_job FROM public.data_import_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found'; END IF;

  v_config := COALESCE(v_job.config_json,'{}'::jsonb);
  v_source := v_job.source;
  IF v_source NOT IN ('phc','hubspot') THEN RAISE EXCEPTION 'unsupported_source: %', v_source; END IF;

  FOREACH v_key IN ARRAY v_forbidden LOOP
    IF COALESCE((v_config->>v_key)::boolean,false) THEN
      RAISE EXCEPTION 'non_crm_side_effect_declared: %', v_key;
    END IF;
  END LOOP;

  FOR v_row IN
    SELECT * FROM public.data_import_rows
    WHERE job_id = p_job_id AND approval_state = 'approved'
    ORDER BY row_number
  LOOP
    BEGIN
      v_toggles := COALESCE(v_row.approve_toggles_json,'{}'::jsonb);
      IF COALESCE((v_toggles->>'workspace')::boolean,false)
         OR COALESCE((v_toggles->>'startup')::boolean,false)
         OR COALESCE((v_toggles->>'contract_proposal')::boolean,false)
         OR COALESCE((v_toggles->>'user')::boolean,false)
         OR COALESCE((v_toggles->>'invitation')::boolean,false) THEN
        UPDATE public.data_import_rows SET approval_state='failed',
          commit_result_json = jsonb_build_object('error','row_declares_side_effect','toggles',v_toggles)
          WHERE id = v_row.id;
        v_failed := v_failed + 1; CONTINUE;
      END IF;
      IF NOT COALESCE((v_toggles->>'crm')::boolean,false) THEN
        UPDATE public.data_import_rows SET approval_state='committed',
          commit_result_json = jsonb_build_object('action','skip','reason','crm_toggle_off') WHERE id = v_row.id;
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;

      v_n := COALESCE(v_row.normalized_json,'{}'::jsonb);
      v_stage := COALESCE(v_n->>'stage', v_config->>'default_stage', 'qualified');
      v_type  := COALESCE(v_n->>'type',  v_config->>'entity_type',  'lead');
      v_attach_hs := COALESCE((v_n->>'attach_hubspot_link')::boolean, false);

      v_match_id := NULL; v_match_reason := NULL; v_conflict := false;

      IF NULLIF(v_n->>'phc_customer_id','') IS NOT NULL THEN
        SELECT id INTO v_candidate FROM public.funnel_items
        WHERE phc_customer_id = v_n->>'phc_customer_id' LIMIT 1;
        IF FOUND THEN v_match_id := v_candidate; v_match_reason := 'phc_customer_id'; END IF;
      END IF;

      IF NULLIF(v_n->>'nif_normalized','') IS NOT NULL THEN
        SELECT id INTO v_candidate FROM public.funnel_items
        WHERE nif_normalized = v_n->>'nif_normalized' LIMIT 1;
        IF FOUND THEN
          IF v_match_id IS NULL THEN v_match_id := v_candidate; v_match_reason := 'nif';
          ELSIF v_match_id <> v_candidate THEN v_conflict := true; v_match_reason := v_match_reason || '+nif_conflict';
          END IF;
        END IF;
      END IF;

      IF NOT v_conflict AND v_attach_hs AND NULLIF(v_n->>'hubspot_company_id','') IS NOT NULL THEN
        SELECT id INTO v_candidate FROM public.funnel_items
        WHERE hubspot_company_id = v_n->>'hubspot_company_id' LIMIT 1;
        IF FOUND THEN
          IF v_match_id IS NULL THEN v_match_id := v_candidate; v_match_reason := 'hubspot_company_id';
          ELSIF v_match_id <> v_candidate THEN v_conflict := true; v_match_reason := v_match_reason || '+hubspot_conflict';
          END IF;
        END IF;
      END IF;

      IF NOT v_conflict AND v_match_id IS NULL AND NULLIF(v_n->>'organization_email','') IS NOT NULL THEN
        SELECT id INTO v_candidate FROM public.funnel_items
        WHERE lower(contact_email) = lower(v_n->>'organization_email')
           OR lower(metadata_json->>'organization_email') = lower(v_n->>'organization_email')
        LIMIT 1;
        IF FOUND THEN v_match_id := v_candidate; v_match_reason := 'unique_email'; END IF;
      END IF;

      IF v_conflict THEN
        UPDATE public.data_import_rows SET approval_state='conflict',
          commit_result_json = jsonb_build_object('action','conflict','reason', v_match_reason, 'target_id', v_match_id)
          WHERE id = v_row.id;
        v_conflicts := v_conflicts + 1; CONTINUE;
      END IF;

      v_tags := ARRAY['phc_import','phc_active_customer'];
      IF NULLIF(v_n->>'service_code','') IS NOT NULL THEN v_tags := v_tags || ARRAY[v_n->>'service_code']; END IF;
      IF COALESCE((v_n->>'requires_hubspot_review')::boolean,false) THEN v_tags := v_tags || ARRAY['hubspot_review_required']; END IF;

      v_metadata := jsonb_build_object(
        'phc_customer_id', v_n->>'phc_customer_id',
        'organization_legal_name', v_n->>'organization_legal_name',
        'organization_email', v_n->>'organization_email',
        'organization_phone', v_n->>'organization_phone',
        'country', v_n->>'country',
        'nif_raw', v_n->>'nif_raw',
        'nif_normalized', v_n->>'nif_normalized',
        'customer_status', v_n->>'customer_status',
        'service_code', v_n->>'service_code',
        'phc_service', v_n->>'phc_service',
        'phc_department_original', v_n->>'phc_department',
        'phc_typology_original', v_n->>'phc_typology',
        'phc_price_reference_original', v_n->>'phc_price_reference',
        'hubspot_stages_original', v_n->>'hubspot_stages_original',
        'hubspot_owners_original', v_n->>'hubspot_owners_original',
        'hubspot_match_status', v_n->>'hubspot_match_status',
        'hubspot_match_reason', v_n->>'hubspot_match_reason',
        'hubspot_deal_ids_all', v_n->>'hubspot_deal_ids_all',
        'hubspot_contact_ids_all', v_n->>'hubspot_contact_ids_all',
        'crm_action_proposed', v_n->>'crm_action_proposed',
        'attach_hubspot_link', v_attach_hs,
        'requires_hubspot_review', COALESCE((v_n->>'requires_hubspot_review')::boolean,false),
        'requires_contract_verification', COALESCE((v_n->>'requires_contract_verification')::boolean,false),
        'requires_consultant_verification', COALESCE((v_n->>'requires_consultant_verification')::boolean,false),
        'requires_programme_cohort_verification', COALESCE((v_n->>'requires_programme_cohort_verification')::boolean,false),
        'requires_physical_office_verification', COALESCE((v_n->>'requires_physical_office_verification')::boolean,false),
        'classification_source', v_n->>'classification_source',
        'classification_confidence', v_n->>'classification_confidence',
        'provenance','phc_hubspot_reconciliation_2026_07_14',
        'job_id', v_row.job_id::text,
        'row_id', v_row.id::text
      );

      v_payload := jsonb_build_object(
        'organization_name', v_n->>'organization_name',
        'contact_name', v_n->>'contact_name',
        'contact_email', COALESCE(v_n->>'contact_email', v_n->>'organization_email'),
        'contact_phone', v_n->>'organization_phone',
        'type', v_type,
        'phc_customer_id', v_n->>'phc_customer_id',
        'nif_normalized', v_n->>'nif_normalized',
        'hubspot_company_id', CASE WHEN v_attach_hs THEN NULLIF(v_n->>'hubspot_company_id','') ELSE NULL END,
        'hubspot_deal_id',    CASE WHEN v_attach_hs THEN NULLIF(v_n->>'hubspot_deal_id','')    ELSE NULL END,
        'metadata_json', v_metadata
      );

      v_external_ids := '{}'::jsonb;
      IF NULLIF(v_n->>'phc_customer_id','') IS NOT NULL THEN v_external_ids := v_external_ids || jsonb_build_object('phc/customer', v_n->>'phc_customer_id'); END IF;
      IF v_attach_hs THEN
        IF NULLIF(v_n->>'hubspot_company_id','') IS NOT NULL THEN v_external_ids := v_external_ids || jsonb_build_object('hubspot/company', v_n->>'hubspot_company_id'); END IF;
        IF NULLIF(v_n->>'hubspot_deal_id','') IS NOT NULL     THEN v_external_ids := v_external_ids || jsonb_build_object('hubspot/deal',    v_n->>'hubspot_deal_id'); END IF;
        IF NULLIF(v_n->>'hubspot_contact_id','') IS NOT NULL  THEN v_external_ids := v_external_ids || jsonb_build_object('hubspot/contact', v_n->>'hubspot_contact_id'); END IF;
      END IF;

      DECLARE v_before jsonb; v_target_id uuid; v_action text;
      BEGIN
        IF v_match_id IS NOT NULL THEN
          SELECT to_jsonb(fi.*) INTO v_before FROM public.funnel_items fi WHERE fi.id=v_match_id FOR UPDATE;
          UPDATE public.funnel_items SET
            organization_name = COALESCE(NULLIF(v_payload->>'organization_name',''), organization_name),
            contact_name      = COALESCE(NULLIF(v_payload->>'contact_name',''),      contact_name),
            contact_email     = COALESCE(NULLIF(v_payload->>'contact_email',''),     contact_email),
            contact_phone     = COALESCE(NULLIF(v_payload->>'contact_phone',''),     contact_phone),
            stage             = v_stage,
            type              = v_type,
            tags              = ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}'::text[]) || v_tags)),
            metadata_json     = COALESCE(metadata_json,'{}'::jsonb) || v_metadata,
            phc_customer_id   = COALESCE(NULLIF(v_payload->>'phc_customer_id',''),   phc_customer_id),
            nif_normalized    = COALESCE(NULLIF(v_payload->>'nif_normalized',''),    nif_normalized),
            hubspot_company_id= CASE WHEN v_attach_hs THEN COALESCE(NULLIF(v_payload->>'hubspot_company_id',''), hubspot_company_id) ELSE hubspot_company_id END,
            hubspot_deal_id   = CASE WHEN v_attach_hs THEN COALESCE(NULLIF(v_payload->>'hubspot_deal_id',''),    hubspot_deal_id)    ELSE hubspot_deal_id    END,
            source_system     = 'phc_hubspot_reconciliation_2026_07_14',
            source_updated_at = GREATEST(COALESCE(source_updated_at,'epoch'::timestamptz), now()),
            updated_at        = now()
          WHERE id = v_match_id;
          v_target_id := v_match_id; v_action := 'update';
        ELSE
          INSERT INTO public.funnel_items (
            organization_name, contact_name, contact_email, contact_phone,
            type, stage, tags, metadata_json,
            phc_customer_id, hubspot_company_id, hubspot_deal_id, nif_normalized,
            source_system, source_updated_at
          ) VALUES (
            v_payload->>'organization_name', v_payload->>'contact_name',
            v_payload->>'contact_email', v_payload->>'contact_phone',
            v_type, v_stage, v_tags, v_metadata,
            NULLIF(v_payload->>'phc_customer_id',''),
            CASE WHEN v_attach_hs THEN NULLIF(v_payload->>'hubspot_company_id','') ELSE NULL END,
            CASE WHEN v_attach_hs THEN NULLIF(v_payload->>'hubspot_deal_id','')    ELSE NULL END,
            NULLIF(v_payload->>'nif_normalized',''),
            'phc_hubspot_reconciliation_2026_07_14', now()
          ) RETURNING id INTO v_target_id;
          v_before := NULL; v_action := 'insert';
        END IF;

        DECLARE k text; val text; prov text; ot text;
        BEGIN
          FOR k, val IN SELECT key, value FROM jsonb_each_text(v_external_ids) LOOP
            IF NULLIF(val,'') IS NULL THEN CONTINUE; END IF;
            prov := split_part(k,'/',1); ot := split_part(k,'/',2);
            INSERT INTO public.external_entity_refs (provider, object_type, external_id, internal_entity_type, internal_entity_id, metadata_json)
            VALUES (prov, ot, val, 'funnel_item', v_target_id, jsonb_build_object('job_id',v_row.job_id::text))
            ON CONFLICT (provider, object_type, external_id) DO UPDATE
              SET internal_entity_id = EXCLUDED.internal_entity_id, updated_at = now();
          END LOOP;
        END;

        UPDATE public.data_import_rows SET approval_state='committed',
          commit_result_json = jsonb_build_object(
            'action', v_action, 'target_id', v_target_id,
            'match_reason', v_match_reason, 'before_json', v_before
          ) WHERE id = v_row.id;
        v_committed := v_committed + 1;
        IF v_action='insert' THEN v_inserted := v_inserted + 1; ELSE v_updated := v_updated + 1; END IF;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.data_import_rows SET approval_state='failed',
          commit_result_json = jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE) WHERE id = v_row.id;
        v_failed := v_failed + 1;
      END;
    END;
  END LOOP;

  UPDATE public.data_import_jobs SET
    status='committed', committed_at=now(),
    counts_json = COALESCE(counts_json,'{}'::jsonb) || jsonb_build_object('commit',
      jsonb_build_object('committed',v_committed,'inserted',v_inserted,'updated',v_updated,'failed',v_failed,'conflicts',v_conflicts,'skipped',v_skipped))
  WHERE id = p_job_id;

  RETURN jsonb_build_object('committed',v_committed,'inserted',v_inserted,'updated',v_updated,'failed',v_failed,'conflicts',v_conflicts,'skipped',v_skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_commit_crm_import_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_commit_crm_import_job(uuid) TO service_role;
