-- lovable-cron-fallback-reviewed: wake on queued signature, retry every five minutes only while pending rows exist, unschedule after drain; immediate edge invocation is primary
CREATE OR REPLACE FUNCTION public.sync_contract_signature_downstream() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_intake record; became_signed boolean; became_sent boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  became_signed := NEW.signed_at IS NOT NULL AND NEW.signature_status IN ('signed','completed') AND (OLD.signed_at IS NULL OR OLD.signature_status IS DISTINCT FROM NEW.signature_status);
  became_sent := (NEW.signature_status = 'sent_for_signature' AND OLD.signature_status IS DISTINCT FROM NEW.signature_status) OR (NEW.status = 'pending_signature' AND OLD.status IS DISTINCT FROM NEW.status);
  IF NOT COALESCE(became_signed,false) AND NOT COALESCE(became_sent,false) THEN RETURN NEW; END IF;
  SELECT id,status,funnel_item_id INTO v_intake FROM public.contract_intakes WHERE contract_id=NEW.id ORDER BY created_at DESC LIMIT 1;
  IF became_signed THEN
    IF v_intake.id IS NOT NULL AND v_intake.status NOT IN ('signed','activated','cancelled','rejected') THEN
      UPDATE public.contract_intakes SET status='signed' WHERE id=v_intake.id;
      INSERT INTO public.intake_events(intake_id,event_type,from_status,to_status,metadata) VALUES(v_intake.id,'lifecycle_sync_signed',v_intake.status,'signed',jsonb_build_object('source','trigger:contract_downstream','contract_id',NEW.id));
    END IF;
    UPDATE public.funnel_items SET stage='contracted' WHERE id=COALESCE(v_intake.funnel_item_id,NEW.funnel_item_id) AND stage NOT IN ('contracted','incubating','accelerating','archived','rejected');
    INSERT INTO public.contract_lifecycle_events(contract_id,event_type,event_date,details) VALUES(NEW.id,'signature_synced_signed',current_date,jsonb_build_object('source','trigger:contract_downstream','activation_pending',true));
  ELSIF became_sent THEN
    IF v_intake.id IS NOT NULL AND v_intake.status NOT IN ('signature_sent','signed','activated','cancelled','rejected') THEN
      UPDATE public.contract_intakes SET status='signature_sent' WHERE id=v_intake.id;
      INSERT INTO public.intake_events(intake_id,event_type,from_status,to_status,metadata) VALUES(v_intake.id,'lifecycle_sync_signature_sent',v_intake.status,'signature_sent',jsonb_build_object('source','trigger:contract_downstream','contract_id',NEW.id));
    END IF;
    UPDATE public.funnel_items SET stage='sent_for_signature' WHERE id=COALESCE(v_intake.funnel_item_id,NEW.funnel_item_id) AND stage NOT IN ('sent_for_signature','contracted','incubating','accelerating','archived','rejected');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_contract_signature_downstream() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.guard_intake_activation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'activated' AND OLD.status IS DISTINCT FROM NEW.status AND NOT EXISTS (
    SELECT 1 FROM public.startup_contracts c JOIN public.workspaces w ON w.id=c.workspace_id
    WHERE c.id=NEW.contract_id AND c.status='active' AND c.signed_at IS NOT NULL AND c.signature_status IN ('signed','completed') AND w.status='active' AND w.blocked_at IS NULL
  ) THEN RAISE EXCEPTION 'workspace_activation_not_verified' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_intake_activation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_intake_activation BEFORE UPDATE ON public.contract_intakes FOR EACH ROW EXECUTE FUNCTION public.guard_intake_activation();
CREATE OR REPLACE FUNCTION public.dispatch_contract_activation_recovery() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('contract_activation_recovery'));
  IF EXISTS(SELECT 1 FROM public.startup_contracts WHERE activation_sync_pending AND status IN ('draft','pending_signature','active') AND signed_at IS NOT NULL AND signature_status IN ('signed','completed')) THEN
    PERFORM public.cron_invoke_edge('reconcile-contract-activation');
  ELSE
    SELECT jobid INTO job_id FROM cron.job WHERE jobname='reconcile-contract-activation';
    IF job_id IS NOT NULL THEN PERFORM cron.unschedule(job_id); END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_contract_activation_recovery() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_contract_activation_recovery() TO service_role;
CREATE OR REPLACE FUNCTION public.wake_contract_activation_recovery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job_id bigint;
BEGIN
  IF NEW.activation_sync_pending IS DISTINCT FROM OLD.activation_sync_pending THEN
    PERFORM pg_advisory_xact_lock(hashtext('contract_activation_recovery'));
    IF NEW.activation_sync_pending THEN
      PERFORM cron.schedule('reconcile-contract-activation','*/5 * * * *','SELECT public.dispatch_contract_activation_recovery()');
      PERFORM public.cron_invoke_edge('reconcile-contract-activation');
    ELSIF NOT EXISTS(SELECT 1 FROM public.startup_contracts WHERE activation_sync_pending AND status IN ('draft','pending_signature','active')) THEN
      SELECT jobid INTO job_id FROM cron.job WHERE jobname='reconcile-contract-activation';
      IF job_id IS NOT NULL THEN PERFORM cron.unschedule(job_id); END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.wake_contract_activation_recovery() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wake_contract_activation_recovery AFTER UPDATE ON public.startup_contracts FOR EACH ROW EXECUTE FUNCTION public.wake_contract_activation_recovery();