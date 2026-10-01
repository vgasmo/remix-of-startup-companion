-- RC9 Parte 3: P3.7, P3.9, P3.10, P3.19, P3.21, P3.22
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'list_ecosystem_items_v2';
  IF d IS NULL OR position($q$NOT IN ('lost','disqualified','contracted')$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'list_ecosystem_items_v2: filtro de estados esperado não encontrado';
  END IF;
  d := replace(d, $q$NOT IN ('lost','disqualified','contracted')$q$,
                  $q$NOT IN ('lost','disqualified','contracted','archived')$q$);
  EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION public.reopen_expired_work_queue_snoozes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.staff_work_queue_items s SET status = 'done', updated_at = now()
   WHERE s.status = 'snoozed' AND s.snoozed_until <= now()
     AND EXISTS (SELECT 1 FROM public.staff_work_queue_items o
                  WHERE o.workspace_id = s.workspace_id AND o.type = s.type
                    AND o.status IN ('open','in_progress'));
  WITH c AS (
    SELECT DISTINCT ON (workspace_id, type) id FROM public.staff_work_queue_items
     WHERE status = 'snoozed' AND snoozed_until <= now()
     ORDER BY workspace_id, type, snoozed_until DESC)
  UPDATE public.staff_work_queue_items s SET status = 'open', snoozed_until = NULL, updated_at = now()
    FROM c WHERE s.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
REVOKE EXECUTE ON FUNCTION public.reopen_expired_work_queue_snoozes() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_work_queue_respect_snooze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('open','in_progress') AND EXISTS (
       SELECT 1 FROM public.staff_work_queue_items s
        WHERE s.workspace_id = NEW.workspace_id AND s.type = NEW.type
          AND s.status = 'snoozed' AND s.snoozed_until > now()) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_work_queue_respect_snooze() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_work_queue_respect_snooze ON public.staff_work_queue_items;
CREATE TRIGGER trg_work_queue_respect_snooze BEFORE INSERT ON public.staff_work_queue_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_queue_respect_snooze();

DO $do$
BEGIN
  PERFORM cron.unschedule('reopen-work-queue-snoozes')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reopen-work-queue-snoozes');
  PERFORM cron.schedule('reopen-work-queue-snoozes', '23 * * * *',
    $cron$SELECT public.cron_invoke_rpc('reopen_expired_work_queue_snoozes', 'public.reopen_expired_work_queue_snoozes()')$cron$);
END $do$;
INSERT INTO public.automation_health_expectations (job_name, expected_cadence_seconds, grace_seconds, severity)
VALUES ('reopen_expired_work_queue_snoozes', 3600, 900, 'low')
ON CONFLICT (job_name) DO NOTHING;

ALTER TABLE public.staff_work_queue_items DROP CONSTRAINT IF EXISTS staff_work_queue_items_type_check;
ALTER TABLE public.staff_work_queue_items ADD CONSTRAINT staff_work_queue_items_type_check CHECK (type = ANY (ARRAY[
  'triage','outreach','schedule_session','post_session_followup','overdue_actions','missing_kpis',
  'stage_gate_review','escalation','monthly_review','quarterly_review','validate_actions','review_checkin',
  'counter_sign_contract','financial_assumption_skipped','milestone_missed']));

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.check_automation_health()'::regprocedure);
  IF position('WHERE job_name = e.job_name' IN d) = 0 THEN
    RAISE EXCEPTION 'check_automation_health: texto esperado não encontrado';
  END IF;
  d := replace(d, 'WHERE job_name = e.job_name', 'WHERE job_name = e.job_name AND triggered_by = ''cron''');
  EXECUTE d;
END $$;

DO $do$
BEGIN
  PERFORM cron.unschedule('anonymize-founder-pulse-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'anonymize-founder-pulse-daily');
  PERFORM cron.schedule(
    'anonymize-founder-pulse-daily', '41 3 * * *',
    format('SELECT public.cron_invoke_rpc(%L, %L)',
           'anonymize_stale_founder_pulse_responses',
           'public.anonymize_stale_founder_pulse_responses()'));
END
$do$;
INSERT INTO public.automation_health_expectations (job_name, expected_cadence_seconds, grace_seconds, severity, owner)
VALUES ('anonymize_stale_founder_pulse_responses', 86400, 3600, 'low', 'ops')
ON CONFLICT (job_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.finalize_crm_import_batch(p_batch_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pending int; v_failed int; v_new_state text;
BEGIN
  IF NOT (public.is_staff() OR public.has_role(auth.uid(),'backoffice') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) FILTER (WHERE valid AND committed_funnel_item_id IS NULL),
         count(*) FILTER (WHERE NOT valid)
    INTO v_pending, v_failed
    FROM public.crm_lead_import_rows WHERE batch_id = p_batch_id;
  v_new_state := CASE WHEN v_failed = 0 AND v_pending = 0 THEN 'committed' ELSE 'partial_needs_review' END;
  UPDATE public.crm_lead_import_batches
     SET lifecycle_state = v_new_state, updated_at = now() WHERE id = p_batch_id;
  RETURN v_new_state;
END; $$;
REVOKE ALL ON FUNCTION public.finalize_crm_import_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_crm_import_batch(uuid) TO service_role, authenticated;