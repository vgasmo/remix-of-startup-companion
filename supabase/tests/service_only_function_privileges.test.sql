-- supabase/tests/service_only_function_privileges.test.sql
-- Funções internas (edge functions com service role ou pg_cron) não podem ser executáveis por anon/authenticated.
-- Só é significativo com o harness a emular os default privileges do Supabase (P1.11).
BEGIN;
SELECT plan(1);
SELECT is_empty($q$
  SELECT s AS exposed_function,
         has_function_privilege('anon', s::regprocedure, 'EXECUTE') AS anon,
         has_function_privilege('authenticated', s::regprocedure, 'EXECUTE') AS authenticated
    FROM unnest(ARRAY[
    'public.generate_weekly_checkins()',
    'public.cleanup_old_rate_limits()',
    'public.commit_import_funnel_item_v2(uuid,uuid,uuid,timestamptz,text,jsonb,jsonb,jsonb,text,text[])',
    'public.admin_commit_crm_import_job(uuid)',
    'public.admin_rollback_crm_import_job(uuid)',
    'public.check_ecosystem_invariants()',
    'public.log_cron_job_run(text,text,integer,text,text,jsonb,text)',
    'public.check_automation_health()',
    'public.check_email_sync_health()',
    'public.reconcile_contract_founders(uuid)',
    'public.open_monthly_founder_pulse_cycles()',
    'public.claim_notification_attempts(text,integer,integer)',
    'public.mark_notification_delivered(uuid,text,jsonb)',
    'public.mark_notification_failed(uuid,text,text,boolean)',
    'public.commit_first_contact_booking_atomic(text,jsonb,jsonb,uuid,uuid,jsonb,jsonb)',
    'public.commit_crm_lead_import_batch_atomic(uuid,uuid[])',
    'public.claim_docusign_envelope(uuid,text)',
    'public.finalize_docusign_envelope(uuid,text,text,text,text,text)',
    'public.release_docusign_envelope_command(uuid,text,text)',
    'public.enqueue_pulse_notifications(uuid)',
    'public.open_and_notify_monthly_founder_pulse_cycles()',
    'public.apply_contract_signature_atomic(uuid,uuid,text,text,uuid,jsonb,text,text,text,text,text)',
    'public.claim_docusign_dispatch_lease(uuid,text,text,integer,text)',
    'public.mark_docusign_dispatch_in_flight(text,text)',
    'public.mark_docusign_dispatch_unknown(text,text,text)',
    'public.finalize_docusign_dispatch_lease(text,text,text)',
    'public.reconcile_docusign_dispatch_lease(text,text,text)',
    'public.anonymize_stale_founder_pulse_responses()',
    'public.claim_first_contact_outbox_batch(integer,integer)',
    'public.mark_first_contact_outbox_completed(uuid)',
    'public.mark_first_contact_outbox_failed(uuid,text,integer)',
    'public.serialize_program_tree(uuid)',
    'public.issue_cron_token(text)',
    'public.consume_cron_token(text,text)',
    'public.cron_invoke_edge(text,jsonb)',
    'public.cron_invoke_rpc(text,text)',
    'public.touch_public_booking_rate_limit(text,text)'
    ]::text[]) AS s
   WHERE has_function_privilege('anon', s::regprocedure, 'EXECUTE')
      OR has_function_privilege('authenticated', s::regprocedure, 'EXECUTE')
$q$, 'internal SECURITY DEFINER functions are not executable by anon or authenticated');
SELECT * FROM finish();
ROLLBACK;
