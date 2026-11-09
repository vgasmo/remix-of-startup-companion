DO $$
DECLARE r record; v_nullable boolean;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('documents','workspace_id'),('documents','uploaded_by'),('sessions','workspace_id'),('milestones','workspace_id'),('payments','workspace_id'),('payments','invoice_id'),('invoices','contract_id'),('contract_lifecycle_events','contract_id'),('contract_notices','contract_id'),('contract_reminders','contract_id'),('startup_contracts','workspace_id'),('startup_contracts','funnel_item_id'),('funnel_items','linked_workspace_id'),('funnel_items','linked_startup_id'),('funnel_items','linked_contract_id'),('analytics_events','workspace_id'),('communication_log','matched_startup_id'),('funnel_events','performed_by'),('stage_history','workspace_id'),('action_items','session_id'),('action_items','milestone_id'),('mentor_bookings','workspace_id'),('tool_usage_events','session_id'),('kpi_values','kpi_definition_id'),('staff_tasks','workspace_id'),('workflow_executions','workspace_id'),('playbook_step_evidence','workspace_id'),('workspace_users','user_id'),('mentor_connections','founder_id'),('mentor_connections','mentor_id'),('team_members','user_id'),('client_error_logs','user_id')
 ) AS v(tbl,col) LOOP
 SELECT(c.is_nullable='YES') INTO v_nullable FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=r.tbl AND c.column_name=r.col;
 IF v_nullable IS NULL THEN CONTINUE; END IF;
 IF EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0] WHERE i.indrelid=format('public.%I',r.tbl)::regclass AND a.attname=r.col AND i.indisvalid AND(i.indpred IS NULL OR pg_get_expr(i.indpred,i.indrelid)~('^\(?'||r.col||' IS NOT NULL\)?$'))) THEN CONTINUE; END IF;
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)%s','idx_'||r.tbl||'_'||r.col,r.tbl,r.col,CASE WHEN v_nullable THEN format(' WHERE %I IS NOT NULL',r.col) ELSE '' END);
 END LOOP;
END $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('external_entity_refs','external_entity_refs_provider_object_type_external_id_key','external_entity_refs_provider_object_external_uniq',false),
 ('funnel_items','uq_funnel_items_hubspot_company_id','funnel_items_hubspot_company_id_uniq',false),
 ('funnel_items','uq_funnel_items_phc_customer_id','funnel_items_phc_customer_id_uniq',false),
 ('investor_updates','investor_updates_workspace_id_month_key','investor_updates_workspace_month_unique',true),
 ('kpi_values','kpi_entries_workspace_id_kpi_definition_id_month_key','kpi_values_workspace_kpi_period_unique',true),
 ('mentor_connections','mentor_connections_mentor_workspace_key','mentor_connections_mentor_workspace_unique',false),
 ('public_booking_links','uniq_public_booking_links_canonical_active','public_booking_links_one_active_canonical',false),
 ('survey_responses','survey_responses_instance_id_question_id_key','survey_responses_instance_question_key',false),
 ('workspaces','workspaces_startup_id_program_id_key','workspaces_startup_program_unique',true),
 ('communication_log','idx_communication_log_external_dedupe','idx_communication_log_external_dedup',false),
 ('communication_log','idx_communication_log_external_dedupe','uniq_communication_log_external',false),
 ('communication_log','idx_communication_log_funnel_occurred','idx_communication_log_lead_timeline',false),
 ('communication_log','idx_communication_log_workspace_occurred','idx_communication_log_timeline',false),
 ('outlook_calendar_settings','outlook_calendar_settings_workspace_id_key','idx_outlook_settings_workspace',false),
 ('tags','tags_name_key','idx_tags_name',false),
 ('founder_pulse_cycles','founder_pulse_cycles_workspace_id_period_month_key','idx_founder_pulse_cycles_workspace',false)
 ) AS v(tbl,keep,drop_name,is_constraint) LOOP
 IF to_regclass(format('public.%I',r.keep)) IS NULL THEN CONTINUE; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=format('public.%I',r.keep)::regclass AND indisvalid) THEN CONTINUE; END IF;
 IF r.is_constraint AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=format('public.%I',r.tbl)::regclass AND conname=r.drop_name) THEN EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',r.tbl,r.drop_name);
 ELSIF to_regclass(format('public.%I',r.drop_name)) IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conindid=to_regclass(format('public.%I',r.drop_name))) THEN EXECUTE format('DROP INDEX public.%I',r.drop_name); END IF;
 END LOOP;
END $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('idx_sessions_status','idx_sessions_status_scheduled_at'),
 ('idx_template_instances_workspace','template_instances_workspace_template_unique'),
 ('idx_session_feedback_session','session_feedback_session_id_user_id_key'),
 ('idx_program_alert_rules_program','program_alert_rules_program_id_rule_type_key'),
 ('idx_workspace_alerts_workspace','workspace_alerts_workspace_id_rule_type_status_key'),
 ('idx_playbook_items_playbook','idx_playbook_items_order'),
 ('idx_workspace_playbook_instances_workspace','workspace_playbook_instances_workspace_id_playbook_id_key'),
 ('idx_workspace_tags_workspace','workspace_tags_pkey'),('idx_session_tags_session','session_tags_pkey'),('idx_action_tags_action','action_tags_pkey'),
 ('idx_program_core_kpis_program_id','program_core_kpis_program_id_kpi_definition_id_key'),
 ('idx_survey_instances_campaign','survey_instances_campaign_id_workspace_id_key'),
 ('idx_survey_responses_instance','survey_responses_instance_id_question_id_key'),
 ('idx_funnel_items_owner','idx_funnel_items_last_activity'),
 ('idx_workspace_invitations_workspace_id','unique_workspace_email'),
 ('idx_crm_stage_email_log_funnel','crm_stage_email_log_funnel_item_id_from_stage_to_stage_rule_key'),
 ('idx_contract_discounts_contract','idx_contract_discounts_active'),
 ('idx_program_weeks_program_id','program_weeks_program_id_week_number_key'),
 ('idx_workspace_celebrations_ws','workspace_celebrations_workspace_id_event_key_key'),
 ('idx_bulk_import_rows_batch','idx_bulk_import_rows_batch_status'),
 ('idx_cohort_benchmarks_program','cohort_benchmarks_program_id_stage_metric_key_key'),
 ('idx_fps_workspace','financial_plan_sessions_workspace_id_scenario_key'),
 ('idx_fa_workspace','idx_fa_key'),('idx_dir_job','data_import_rows_job_id_row_number_key'),
 ('idx_session_participants_session','session_participants_session_id_user_id_key'),
 ('idx_crm_lead_import_rows_batch','crm_lead_import_rows_batch_id_row_hash_key'),
 ('idx_founder_pulse_responses_cycle','founder_pulse_responses_cycle_id_respondent_id_key'),
 ('idx_survey_writebacks_instance','survey_writebacks_instance_id_question_id_key'),
 ('idx_client_error_logs_message',NULL)
 ) AS v(redundant,covering) LOOP
 IF to_regclass(format('public.%I',r.redundant)) IS NULL THEN CONTINUE; END IF;
 IF r.covering IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_index WHERE indisvalid AND indexrelid=to_regclass(format('public.%I',r.covering))) THEN CONTINUE; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conindid=to_regclass(format('public.%I',r.redundant))) THEN CONTINUE; END IF;
 EXECUTE format('DROP INDEX public.%I',r.redundant);
 END LOOP;
END $$;