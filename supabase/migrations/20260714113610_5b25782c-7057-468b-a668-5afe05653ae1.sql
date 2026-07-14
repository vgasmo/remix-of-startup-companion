
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
  v_forbidden text[] := ARRAY['create_startups','create_workspaces','create_contract_proposals','create_users','create_invitations','create_notifications','run_automations'];
  v_key text;
  v_toggles jsonb;
  v_payload jsonb;
  v_external_ids jsonb;
  v_tags text[];
  v_final_stage text;
  v_n jsonb;
  v_rpc jsonb;
  v_committed int := 0; v_inserted int := 0; v_updated int := 0;
  v_failed int := 0; v_stale int := 0; v_skipped int := 0;
BEGIN
  SELECT * INTO v_job FROM public.data_import_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found'; END IF;

  v_config := COALESCE(v_job.config_json,'{}'::jsonb);
  v_source := v_job.source;
  IF v_source NOT IN ('phc','hubspot') THEN RAISE EXCEPTION 'unsupported_source: %', v_source; END IF;

  FOREACH v_key IN ARRAY v_forbidden LOOP
    IF COALESCE((v_config->>v_key)::boolean,false) THEN
      RAISE EXCEPTION 'non_crm_side_effect_declared: %', v_key;
    END IF;
  END LOOP;

  UPDATE public.data_import_jobs SET status='committing' WHERE id = p_job_id;

  FOR v_row IN
    SELECT * FROM public.data_import_rows
    WHERE job_id = p_job_id AND approval_state = 'approved'
    ORDER BY row_number
  LOOP
    BEGIN
      v_toggles := COALESCE(v_row.approve_toggles_json,'{}'::jsonb);
      IF COALESCE((v_toggles->>'workspace')::boolean,false)
         OR COALESCE((v_toggles->>'startup')::boolean,false)
         OR COALESCE((v_toggles->>'contract_proposal')::boolean,false) THEN
        UPDATE public.data_import_rows SET approval_state='failed',
          commit_result_json = jsonb_build_object('error','row_declares_side_effect','toggles',v_toggles)
          WHERE id = v_row.id;
        v_failed := v_failed + 1; CONTINUE;
      END IF;
      IF NOT COALESCE((v_toggles->>'crm')::boolean,false) THEN
        UPDATE public.data_import_rows SET approval_state='committed',
          commit_result_json = jsonb_build_object('action','skip','reason','crm_toggle_off')
          WHERE id = v_row.id;
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;

      v_n := COALESCE(v_row.normalized_json,'{}'::jsonb);

      IF v_source = 'phc' THEN
        v_tags := ARRAY['phc_import'];
        IF v_n ? 'phc_department' AND v_n->>'phc_department' IS NOT NULL AND v_n->>'phc_department' <> '' THEN
          v_tags := v_tags || ('phc_department:'||(v_n->>'phc_department'));
        END IF;
        IF v_n ? 'phc_building_hint' AND v_n->>'phc_building_hint' IS NOT NULL AND v_n->>'phc_building_hint' <> '' THEN
          v_tags := v_tags || ('phc_building:'||(v_n->>'phc_building_hint'));
        END IF;
        v_payload := jsonb_build_object(
          'organization_name', v_n->>'organization_name',
          'contact_name', v_n->>'contact_name',
          'contact_email', COALESCE(v_n->>'contact_email', v_n->>'organization_email'),
          'contact_phone', v_n->>'organization_phone',
          'program_id', v_config->>'program_id',
          'type','startup',
          'phc_customer_id', v_n->>'phc_customer_id',
          'nif_normalized', v_n->>'nif_normalized',
          'source_updated_at', NULL,
          'metadata_json', jsonb_build_object(
            'phc_customer_id', v_n->>'phc_customer_id',
            'organization_short_name', v_n->>'organization_short_name',
            'nif_raw', v_n->>'nif_raw',
            'nif_kind', v_n->>'nif_kind',
            'country', v_n->>'country',
            'phc_department', v_n->>'phc_department',
            'phc_service_hint', v_n->>'phc_service_hint',
            'phc_building_hint', v_n->>'phc_building_hint',
            'phc_price_list_id', v_n->>'phc_price_list_id',
            'organization_email', v_n->>'organization_email',
            'contact_secondary_name', v_n->>'contact_secondary_name',
            'contact_secondary_email', v_n->>'contact_secondary_email',
            'hubspot_company_id_ref', v_n->>'hubspot_company_id_ref',
            'hubspot_deal_id_ref', v_n->>'hubspot_deal_id_ref',
            'hubspot_contact_id_ref', v_n->>'hubspot_contact_id_ref',
            'hubspot_stages', v_n->>'hubspot_stages',
            'hubspot_owners', v_n->>'hubspot_owners',
            'match_status', v_n->>'match_status',
            'match_reason', v_n->>'match_reason',
            'provenance','phc_import',
            'job_id', v_row.job_id::text,
            'row_id', v_row.id::text
          )
        );
        v_external_ids := '{}'::jsonb;
        IF NULLIF(v_n->>'phc_customer_id','') IS NOT NULL THEN
          v_external_ids := v_external_ids || jsonb_build_object('phc/customer', v_n->>'phc_customer_id');
        END IF;
        IF NULLIF(v_n->>'hubspot_company_id_ref','') IS NOT NULL THEN
          v_external_ids := v_external_ids || jsonb_build_object('hubspot/company', v_n->>'hubspot_company_id_ref');
        END IF;
        IF NULLIF(v_n->>'hubspot_deal_id_ref','') IS NOT NULL THEN
          v_external_ids := v_external_ids || jsonb_build_object('hubspot/deal', v_n->>'hubspot_deal_id_ref');
        END IF;
        IF NULLIF(v_n->>'hubspot_contact_id_ref','') IS NOT NULL THEN
          v_external_ids := v_external_ids || jsonb_build_object('hubspot/contact', v_n->>'hubspot_contact_id_ref');
        END IF;
        v_final_stage := COALESCE(v_config->>'default_stage','customer');
      ELSE
        v_tags := ARRAY['hubspot_import'];
        v_payload := jsonb_build_object(
          'organization_name', v_n->>'organization_name',
          'contact_email', v_n->>'contact_email',
          'hubspot_deal_id', v_n->>'deal_id',
          'hubspot_company_id', v_n->>'company_id',
          'nif_normalized', v_n->>'nif',
          'type','startup',
          'metadata_json', v_n
        );
        v_external_ids := '{}'::jsonb;
        IF NULLIF(v_n->>'deal_id','') IS NOT NULL THEN v_external_ids := v_external_ids || jsonb_build_object('hubspot/deal', v_n->>'deal_id'); END IF;
        IF NULLIF(v_n->>'company_id','') IS NOT NULL THEN v_external_ids := v_external_ids || jsonb_build_object('hubspot/company', v_n->>'company_id'); END IF;
        v_final_stage := COALESCE(v_n->>'resolved_stage', v_config->>'default_stage','new');
      END IF;

      BEGIN
        v_rpc := public.commit_import_funnel_item_v2(
          v_row.job_id, v_row.id, v_row.match_entity_id, v_row.match_snapshot_updated_at,
          v_source, v_payload, v_external_ids, '{}'::jsonb, v_final_stage, v_tags
        );
        UPDATE public.data_import_rows SET approval_state='committed', commit_result_json = v_rpc
          WHERE id = v_row.id;
        v_committed := v_committed + 1;
        IF v_rpc->>'action' = 'insert' THEN v_inserted := v_inserted + 1;
        ELSIF v_rpc->>'action' = 'update' THEN v_updated := v_updated + 1; END IF;
      EXCEPTION WHEN SQLSTATE 'P0003' THEN
        UPDATE public.data_import_rows SET approval_state='stale',
          commit_result_json = jsonb_build_object('error','stale_match') WHERE id = v_row.id;
        v_stale := v_stale + 1;
      WHEN OTHERS THEN
        UPDATE public.data_import_rows SET approval_state='failed',
          commit_result_json = jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE) WHERE id = v_row.id;
        v_failed := v_failed + 1;
      END;
    END;
  END LOOP;

  UPDATE public.data_import_jobs SET
    status = 'committed',
    committed_at = now(),
    counts_json = COALESCE(counts_json,'{}'::jsonb) || jsonb_build_object('commit',
      jsonb_build_object('committed',v_committed,'inserted',v_inserted,'updated',v_updated,'failed',v_failed,'stale',v_stale,'skipped',v_skipped))
  WHERE id = p_job_id;

  RETURN jsonb_build_object('committed',v_committed,'inserted',v_inserted,'updated',v_updated,'failed',v_failed,'stale',v_stale,'skipped',v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_commit_crm_import_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_commit_crm_import_job(uuid) TO service_role;
