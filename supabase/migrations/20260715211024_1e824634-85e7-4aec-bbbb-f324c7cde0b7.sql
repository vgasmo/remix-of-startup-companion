
-- Scheduled invariant check: alerts when the manual resolution queue grows
-- beyond the approved baseline (currently orphan_contracts=3, unlinked_contracted_funnel=2).
-- Writes a row into public.activity_log so it surfaces in staff audit trails,
-- and stores the last-observed counts + baseline in public.system_settings.

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'ecosystem_invariants_baseline',
  jsonb_build_object('orphan_contract', 3, 'unlinked_contracted_funnel', 2),
  'Approved baseline row counts for admin_manual_resolution_queue. Alerts fire when the queue exceeds these values.'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.check_ecosystem_invariants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orphan int;
  v_unlinked int;
  v_baseline jsonb;
  v_base_orphan int;
  v_base_unlinked int;
  v_breached boolean := false;
  v_result jsonb;
BEGIN
  SELECT count(*) INTO v_orphan
    FROM public.admin_manual_resolution_queue
   WHERE record_kind = 'orphan_contract';

  SELECT count(*) INTO v_unlinked
    FROM public.admin_manual_resolution_queue
   WHERE record_kind = 'unlinked_contracted_funnel';

  SELECT value INTO v_baseline
    FROM public.system_settings
   WHERE key = 'ecosystem_invariants_baseline';

  v_base_orphan   := COALESCE((v_baseline->>'orphan_contract')::int, 0);
  v_base_unlinked := COALESCE((v_baseline->>'unlinked_contracted_funnel')::int, 0);

  v_breached := (v_orphan > v_base_orphan) OR (v_unlinked > v_base_unlinked);

  v_result := jsonb_build_object(
    'checked_at', now(),
    'orphan_contract', v_orphan,
    'unlinked_contracted_funnel', v_unlinked,
    'baseline_orphan_contract', v_base_orphan,
    'baseline_unlinked_contracted_funnel', v_base_unlinked,
    'breached', v_breached
  );

  -- Persist last-observed snapshot for the admin panel to read.
  INSERT INTO public.system_settings (key, value, description)
  VALUES (
    'ecosystem_invariants_last_check',
    v_result,
    'Most recent output of check_ecosystem_invariants(); refreshed by pg_cron.'
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();

  IF v_breached THEN
    INSERT INTO public.activity_log (action, entity_type, entity_id, metadata)
    VALUES (
      'ecosystem_invariant_breach',
      'admin_manual_resolution_queue',
      NULL,
      v_result
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ecosystem_invariants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_ecosystem_invariants() TO service_role;

COMMENT ON FUNCTION public.check_ecosystem_invariants() IS
  'Compares admin_manual_resolution_queue counts to the approved baseline in system_settings.ecosystem_invariants_baseline and logs a breach into activity_log when exceeded. Runs hourly via pg_cron.';

-- Unschedule any previous copy and re-create the cron entry.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'ecosystem-invariants-hourly';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'ecosystem-invariants-hourly',
  '17 * * * *',
  $cron$SELECT public.check_ecosystem_invariants();$cron$
);

-- Run once now so the snapshot row exists immediately.
SELECT public.check_ecosystem_invariants();
