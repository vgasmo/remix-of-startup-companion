
-- =========================================================================
-- Release-hardening sprint migration
-- 1. system_alerts table (no user_id required — background/system events)
-- 2. check_ecosystem_invariants() writes to system_alerts (fixes NOT NULL crash)
-- 3. sessions.completion_idempotency_key column
-- 4. complete_session_atomic() SECURITY DEFINER RPC
-- All statements are idempotent (safe to re-run).
-- =========================================================================

-- 1. system_alerts -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL,
  severity   text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  dedupe_key text,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_kind_created
  ON public.system_alerts (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_dedupe
  ON public.system_alerts (dedupe_key) WHERE dedupe_key IS NOT NULL;

GRANT SELECT ON public.system_alerts TO authenticated;
GRANT ALL    ON public.system_alerts TO service_role;

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view system alerts" ON public.system_alerts;
CREATE POLICY "Admins can view system alerts"
  ON public.system_alerts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Rewire invariant monitor -------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_ecosystem_invariants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_baseline_orphans int := 3;
  v_baseline_unlinked int := 2;
  v_orphans int;
  v_unlinked int;
  v_breached boolean := false;
  v_result jsonb;
  v_dedupe text;
BEGIN
  -- Read approved baseline from system_settings (fall back to hardcoded).
  BEGIN
    SELECT
      COALESCE((value->>'orphan_contracts')::int,  v_baseline_orphans),
      COALESCE((value->>'unlinked_contracted')::int, v_baseline_unlinked)
    INTO v_baseline_orphans, v_baseline_unlinked
    FROM public.system_settings
    WHERE key = 'ecosystem_invariants_baseline';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- keep defaults if system_settings absent
  END;

  SELECT COUNT(*) INTO v_orphans
  FROM public.startup_contracts sc
  WHERE sc.workspace_id IS NULL
    AND sc.status IN ('signed','active');

  SELECT COUNT(*) INTO v_unlinked
  FROM public.funnel_items fi
  WHERE fi.stage = 'contracted'
    AND fi.linked_workspace_id IS NULL;

  v_breached := (v_orphans > v_baseline_orphans) OR (v_unlinked > v_baseline_unlinked);

  v_result := jsonb_build_object(
    'checked_at', now(),
    'orphan_contracts', v_orphans,
    'unlinked_contracted', v_unlinked,
    'baseline_orphans', v_baseline_orphans,
    'baseline_unlinked', v_baseline_unlinked,
    'breached', v_breached
  );

  -- Persist last-observed snapshot.
  INSERT INTO public.system_settings (key, value, description)
  VALUES (
    'ecosystem_invariants_last_check',
    v_result,
    'Most recent output of check_ecosystem_invariants(); refreshed by pg_cron.'
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();

  -- Always emit a heartbeat so a silent cron failure is visible.
  v_dedupe := CASE WHEN v_breached
    THEN 'ecosystem_invariant_breach:' || to_char(now(), 'YYYY-MM-DD')
    ELSE 'ecosystem_invariant_heartbeat:' || to_char(now(), 'YYYY-MM-DD-HH24')
  END;

  -- Dedupe: only insert once per dedupe_key per day.
  IF NOT EXISTS (
    SELECT 1 FROM public.system_alerts
    WHERE dedupe_key = v_dedupe
      AND created_at > now() - interval '24 hours'
  ) THEN
    INSERT INTO public.system_alerts (kind, severity, dedupe_key, payload)
    VALUES (
      CASE WHEN v_breached THEN 'ecosystem_invariant_breach' ELSE 'ecosystem_invariant_heartbeat' END,
      CASE WHEN v_breached THEN 'critical' ELSE 'info' END,
      v_dedupe,
      v_result
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ecosystem_invariants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_ecosystem_invariants() TO service_role;

COMMENT ON FUNCTION public.check_ecosystem_invariants() IS
  'Compares admin resolution queue to approved baseline and logs into system_alerts. Always emits a heartbeat so cron failures are detectable.';

-- 3. sessions.completion_idempotency_key --------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS completion_idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_completion_idempotency
  ON public.sessions (completion_idempotency_key)
  WHERE completion_idempotency_key IS NOT NULL;

-- 4. complete_session_atomic --------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_session_atomic(
  p_session_id uuid,
  p_workspace_id uuid,
  p_actual_duration_minutes int,
  p_primary_consultant_id uuid,
  p_template_id uuid,
  p_notes text,
  p_decisions text,
  p_participants jsonb,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_existing_key uuid;
  v_workspace uuid;
  v_is_staff boolean;
  v_row jsonb;
  v_part jsonb;
BEGIN
  -- Auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_actual_duration_minutes IS NULL OR p_actual_duration_minutes <= 0 OR p_actual_duration_minutes > 1440 THEN
    RAISE EXCEPTION 'invalid_actual_duration' USING ERRCODE = '22023';
  END IF;
  IF p_primary_consultant_id IS NULL THEN
    RAISE EXCEPTION 'primary_consultant_required' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  -- Role gate: staff (admin OR consultor) required.
  v_is_staff := public.has_role(v_uid, 'admin'::app_role)
             OR public.has_role(v_uid, 'consultor'::app_role);
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'forbidden_not_staff' USING ERRCODE = '42501';
  END IF;

  -- Lock the row and validate scope + transition.
  SELECT status, workspace_id, completion_idempotency_key
    INTO v_status, v_workspace, v_existing_key
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'workspace_mismatch' USING ERRCODE = '42501';
  END IF;

  -- Idempotent replay: same key already succeeded → return current truth.
  IF v_existing_key IS NOT NULL AND v_existing_key = p_idempotency_key THEN
    RETURN jsonb_build_object(
      'session_id', p_session_id,
      'workspace_id', p_workspace_id,
      'status', v_status,
      'idempotent_replay', true
    );
  END IF;

  IF v_status IS DISTINCT FROM 'scheduled' AND v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'invalid_transition_from_%', v_status USING ERRCODE = '22023';
  END IF;

  -- Verify primary consultant is authorized staff.
  IF NOT (
    public.has_role(p_primary_consultant_id, 'admin'::app_role)
    OR public.has_role(p_primary_consultant_id, 'consultor'::app_role)
  ) THEN
    RAISE EXCEPTION 'consultant_not_staff' USING ERRCODE = '22023';
  END IF;

  -- Update session truth.
  UPDATE public.sessions
     SET status = 'completed',
         actual_duration_minutes = p_actual_duration_minutes,
         primary_consultant_id   = p_primary_consultant_id,
         session_template_id     = COALESCE(p_template_id, session_template_id),
         notes                   = COALESCE(p_notes, notes),
         decisions               = COALESCE(p_decisions, decisions),
         completed_at            = now(),
         completion_idempotency_key = p_idempotency_key,
         updated_at              = now()
   WHERE id = p_session_id;

  -- Upsert attendance in the same transaction.
  IF p_participants IS NOT NULL AND jsonb_typeof(p_participants) = 'array' THEN
    FOR v_part IN SELECT * FROM jsonb_array_elements(p_participants) LOOP
      IF (v_part->>'user_id') IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.session_participants (session_id, user_id, role, attendance_status, source)
      VALUES (
        p_session_id,
        (v_part->>'user_id')::uuid,
        v_part->>'role',
        COALESCE(v_part->>'attendance_status', 'unknown'),
        'completion_dialog'
      )
      ON CONFLICT (session_id, user_id) DO UPDATE
        SET attendance_status = EXCLUDED.attendance_status,
            role              = COALESCE(EXCLUDED.role, public.session_participants.role),
            source            = 'completion_dialog';
    END LOOP;
  END IF;

  -- Audit trail (activity_log requires user_id — we have v_uid).
  INSERT INTO public.activity_log (user_id, workspace_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    p_workspace_id,
    'completed',
    'session',
    p_session_id,
    jsonb_build_object(
      'actual_duration_minutes', p_actual_duration_minutes,
      'primary_consultant_id',   p_primary_consultant_id,
      'idempotency_key',         p_idempotency_key
    )
  );

  v_row := jsonb_build_object(
    'session_id',   p_session_id,
    'workspace_id', p_workspace_id,
    'status',       'completed',
    'idempotent_replay', false
  );
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_session_atomic(uuid, uuid, int, uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_session_atomic(uuid, uuid, int, uuid, uuid, text, text, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_session_atomic(uuid, uuid, int, uuid, uuid, text, text, jsonb, uuid) IS
  'Atomic session completion: locks the session row, validates transition + workspace + staff role, updates session and attendance in one transaction, is idempotent per key.';
