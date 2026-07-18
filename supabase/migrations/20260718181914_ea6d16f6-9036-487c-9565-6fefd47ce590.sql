
-- =========================================================================
-- RC5 P0 — Forward-only launch-rescue migration
-- =========================================================================

-- -----------------------------------------------------------------------
-- 1. Fix invitation tampering trigger (was referencing NEW.token / NEW.invited_by
--    which don't exist; every non-staff acceptance was failing)
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_invitee_field_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff boolean;
BEGIN
  -- Service-role bypass (edge functions restore membership via service key)
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = ANY (ARRAY['admin'::app_role, 'consultor'::app_role])
  ) INTO v_is_staff;

  IF v_is_staff THEN
    RETURN NEW;
  END IF;

  -- Non-staff (invitee): only accepted_at may change
  IF NEW.role         IS DISTINCT FROM OLD.role
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.startup_id   IS DISTINCT FROM OLD.startup_id
     OR NEW.email        IS DISTINCT FROM OLD.email
     OR NEW.token_hash   IS DISTINCT FROM OLD.token_hash
     OR NEW.expires_at   IS DISTINCT FROM OLD.expires_at
     OR NEW.created_by   IS DISTINCT FROM OLD.created_by
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Invitees can only accept invitations; other fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------
-- 2. Atomic invitation acceptance RPC (replaces multi-step edge-function logic)
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text;
  v_inv record;
  v_already_member boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO v_user_email FROM auth.users WHERE id = v_uid;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  -- Lock the invitation row for the duration of the tx
  SELECT * INTO v_inv
    FROM public.workspace_invitations
   WHERE token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_accepted', true,
      'workspace_id', v_inv.workspace_id,
      'startup_id', v_inv.startup_id
    );
  END IF;

  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired' USING ERRCODE = '22023';
  END IF;

  IF lower(v_inv.email) <> v_user_email THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = '42501';
  END IF;

  -- Membership (idempotent)
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_users
     WHERE workspace_id = v_inv.workspace_id AND user_id = v_uid
  ) INTO v_already_member;

  IF NOT v_already_member THEN
    INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
    VALUES (v_inv.workspace_id, v_uid, COALESCE(v_inv.role, 'founder'), true);
  END IF;

  -- Global role (idempotent) — only add founder role if the invitation is for a founder
  IF COALESCE(v_inv.role, 'founder') = 'founder' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'founder'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Mark accepted (this UPDATE goes through the tampering trigger; SECURITY DEFINER runs as owner so trigger sees no auth.uid mismatch — the trigger returns early for admins, but this is a definer path so we set a flag instead. We bypass by setting only accepted_at.)
  UPDATE public.workspace_invitations
     SET accepted_at = now()
   WHERE id = v_inv.id;

  -- Auto-approve profile
  UPDATE public.profiles
     SET account_status = 'approved'
   WHERE id = v_uid AND account_status IN ('pending', 'approved');

  RETURN jsonb_build_object(
    'success', true,
    'already_accepted', false,
    'workspace_id', v_inv.workspace_id,
    'startup_id', v_inv.startup_id,
    'role', v_inv.role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;

-- -----------------------------------------------------------------------
-- 3. Atomic canonical booking-link promotion
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_booking_link_canonical(p_link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_link
    FROM public.public_booking_links
   WHERE id = p_link_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_link.active THEN
    RAISE EXCEPTION 'link_inactive' USING ERRCODE = '22023';
  END IF;
  IF v_link.canonical_url IS NULL THEN
    RAISE EXCEPTION 'legacy_link_missing_url' USING ERRCODE = '22023';
  END IF;

  -- Demote current canonical(s), then promote target — single tx keeps the
  -- partial unique index (only one active canonical) satisfied.
  UPDATE public.public_booking_links
     SET is_canonical = false
   WHERE is_canonical = true AND active = true AND id <> p_link_id;

  UPDATE public.public_booking_links
     SET is_canonical = true
   WHERE id = p_link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_booking_link_canonical(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_booking_link_canonical(uuid) TO authenticated;

-- -----------------------------------------------------------------------
-- 4. Automation health expectations registry
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_health_expectations (
  job_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  expected_cadence_seconds integer NOT NULL,
  grace_seconds integer NOT NULL DEFAULT 300,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  owner text,
  runbook_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_health_expectations TO authenticated;
GRANT ALL ON public.automation_health_expectations TO service_role;

ALTER TABLE public.automation_health_expectations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read expectations" ON public.automation_health_expectations;
CREATE POLICY "Staff read expectations"
  ON public.automation_health_expectations FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- Seed known jobs
INSERT INTO public.automation_health_expectations (job_name, expected_cadence_seconds, grace_seconds, severity, owner)
VALUES
  ('automation-engine', 3600, 600, 'critical', 'ops'),
  ('sweep-session-transcripts', 3600, 600, 'warning', 'ops'),
  ('sync-outlook-emails', 300, 120, 'warning', 'ops'),
  ('email_sync_status', 300, 120, 'warning', 'ops'),
  ('check_automation_health', 900, 300, 'warning', 'ops')
ON CONFLICT (job_name) DO NOTHING;

-- -----------------------------------------------------------------------
-- 5. Rewrite check_automation_health — canonical `failed` status, detect
--    never-run + stale + failing jobs.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_automation_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_dedupe text;
  v_grace interval;
BEGIN
  FOR v_row IN
    SELECT
      e.job_name,
      e.expected_cadence_seconds,
      e.grace_seconds,
      e.severity,
      r.last_ok,
      r.last_failed,
      r.failures_24h
    FROM public.automation_health_expectations e
    LEFT JOIN LATERAL (
      SELECT
        MAX(started_at) FILTER (WHERE status = 'ok') AS last_ok,
        MAX(started_at) FILTER (WHERE status = 'failed') AS last_failed,
        COUNT(*) FILTER (WHERE status = 'failed' AND started_at > now() - interval '24 hours') AS failures_24h
      FROM public.cron_job_runs
      WHERE job_name = e.job_name
        AND started_at > now() - interval '48 hours'
    ) r ON TRUE
    WHERE e.enabled = true
  LOOP
    v_grace := make_interval(secs => v_row.expected_cadence_seconds + v_row.grace_seconds);

    -- Never-run or stale
    IF v_row.last_ok IS NULL OR v_row.last_ok < now() - v_grace THEN
      v_dedupe := 'cron_stale:' || v_row.job_name || ':' || to_char(now(), 'YYYY-MM-DD-HH24');
      INSERT INTO public.system_alerts (kind, severity, dedupe_key, payload)
      VALUES (
        'cron_stale',
        v_row.severity,
        v_dedupe,
        jsonb_build_object(
          'job', v_row.job_name,
          'last_ok', v_row.last_ok,
          'last_failed', v_row.last_failed,
          'never_run', v_row.last_ok IS NULL
        )
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;

    -- Repeated failures
    IF COALESCE(v_row.failures_24h, 0) >= 3 THEN
      v_dedupe := 'cron_failed:' || v_row.job_name || ':' || to_char(now(), 'YYYY-MM-DD');
      INSERT INTO public.system_alerts (kind, severity, dedupe_key, payload)
      VALUES (
        'cron_failed',
        'critical',
        v_dedupe,
        jsonb_build_object('job', v_row.job_name, 'failures_24h', v_row.failures_24h)
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.check_automation_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_automation_health() TO service_role;

-- -----------------------------------------------------------------------
-- 6. Fix check_email_sync_health status vocabulary (was 'error')
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_email_sync_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale int;
  v_flapping int;
BEGIN
  SELECT COUNT(*) INTO v_stale FROM public.email_sync_status
   WHERE last_success_at IS NOT NULL AND last_success_at < now() - interval '2 hours';
  IF v_stale > 0 THEN
    INSERT INTO public.system_alerts (kind, severity, dedupe_key, payload)
    VALUES (
      'email_sync_stale',
      'critical',
      'email_sync_stale:' || to_char(now(), 'YYYY-MM-DD-HH24'),
      jsonb_build_object('stale_count', v_stale)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  SELECT COUNT(*) INTO v_flapping FROM public.email_sync_runs
   WHERE started_at > now() - interval '1 hour' AND status = 'failed';
  IF v_flapping >= 3 THEN
    INSERT INTO public.system_alerts (kind, severity, dedupe_key, payload)
    VALUES (
      'email_sync_flapping',
      'warning',
      'email_sync_flap:' || to_char(now(), 'YYYY-MM-DD-HH24'),
      jsonb_build_object('failures_last_hour', v_flapping)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_email_sync_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_email_sync_health() TO service_role;

-- -----------------------------------------------------------------------
-- 7. Restore staff_diagnose_program_mismatches with real diagnostic logic
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.staff_diagnose_program_mismatches();

CREATE OR REPLACE FUNCTION public.staff_diagnose_program_mismatches()
RETURNS TABLE (
  category text,
  severity text,
  entity_type text,
  entity_id uuid,
  program_id uuid,
  detail text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'consultor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  -- (a) Workspace whose stage_id doesn't belong to its program
  RETURN QUERY
  SELECT
    'stage_program_mismatch'::text,
    'critical'::text,
    'workspace'::text,
    w.id,
    w.program_id,
    format('workspace %s references stage %s from a different program', w.id, w.stage_id)
  FROM public.workspaces w
  JOIN public.stages s ON s.id = w.stage_id
  WHERE w.stage_id IS NOT NULL
    AND w.program_id IS NOT NULL
    AND s.program_id <> w.program_id;

  -- (b) Acceleration program with no weeks
  RETURN QUERY
  SELECT
    'acceleration_missing_weeks'::text,
    'critical'::text,
    'program'::text,
    p.id,
    p.id,
    format('acceleration program "%s" has no program_weeks rows', p.name)
  FROM public.programs p
  WHERE p.program_type = 'acceleration'
    AND NOT EXISTS (SELECT 1 FROM public.program_weeks w WHERE w.program_id = p.id);

  -- (c) Acceleration program with no gates
  RETURN QUERY
  SELECT
    'acceleration_missing_gates'::text,
    'warning'::text,
    'program'::text,
    p.id,
    p.id,
    format('acceleration program "%s" has no program_gates rows', p.name)
  FROM public.programs p
  WHERE p.program_type = 'acceleration'
    AND NOT EXISTS (SELECT 1 FROM public.program_gates g WHERE g.program_id = p.id);

  -- (d) Incubation program with no stages
  RETURN QUERY
  SELECT
    'incubation_missing_stages'::text,
    'critical'::text,
    'program'::text,
    p.id,
    p.id,
    format('incubation program "%s" has no stages', p.name)
  FROM public.programs p
  WHERE COALESCE(p.program_type, 'incubation') = 'incubation'
    AND NOT EXISTS (SELECT 1 FROM public.stages s WHERE s.program_id = p.id);

  -- (e) Actions whose milestone belongs to a different workspace
  RETURN QUERY
  SELECT
    'action_workspace_mismatch'::text,
    'warning'::text,
    'action_item'::text,
    a.id,
    NULL::uuid,
    format('action %s (workspace %s) has milestone %s from workspace %s',
           a.id, a.workspace_id, m.id, m.workspace_id)
  FROM public.action_items a
  JOIN public.milestones m ON m.id = a.milestone_id
  WHERE a.milestone_id IS NOT NULL
    AND m.workspace_id <> a.workspace_id;

  -- (f) Workspace with no active members
  RETURN QUERY
  SELECT
    'workspace_no_members'::text,
    'warning'::text,
    'workspace'::text,
    w.id,
    w.program_id,
    format('workspace %s has no active workspace_users', w.id)
  FROM public.workspaces w
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workspace_users wu
    WHERE wu.workspace_id = w.id AND wu.active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.staff_diagnose_program_mismatches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_diagnose_program_mismatches() TO authenticated;
