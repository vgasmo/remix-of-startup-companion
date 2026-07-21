
CREATE TABLE IF NOT EXISTS public.notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  event_key text,
  channel text NOT NULL CHECK (channel IN ('in_app','email','whatsapp','sms','push')),
  state text NOT NULL CHECK (state IN ('queued','leased','delivered','failed')),
  attempt_no int NOT NULL DEFAULT 1,
  error_message text,
  client_command_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_attempts TO authenticated;
GRANT ALL ON public.notification_attempts TO service_role;

ALTER TABLE public.notification_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read notification_attempts" ON public.notification_attempts;
CREATE POLICY "Staff read notification_attempts"
  ON public.notification_attempts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'consultor'::public.app_role)
      OR public.has_role(auth.uid(), 'backoffice'::public.app_role));

CREATE INDEX IF NOT EXISTS notification_attempts_notif_idx
  ON public.notification_attempts(notification_id);
CREATE INDEX IF NOT EXISTS notification_attempts_cmd_idx
  ON public.notification_attempts(client_command_id)
  WHERE client_command_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_financial_scenario_atomic(
  p_version_id uuid,
  p_expected_updated_at timestamptz,
  p_snapshot jsonb,
  p_key_metrics jsonb,
  p_scenario_name text DEFAULT NULL
)
RETURNS public.financial_model_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.financial_model_versions;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.financial_model_versions
   WHERE id = p_version_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_row.uploaded_by = v_uid
    OR public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'consultor'::public.app_role)
    OR public.has_role(v_uid, 'backoffice'::public.app_role)
    OR public.has_workspace_access(v_uid, v_row.workspace_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NOT NULL
     AND v_row.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'stale_write' USING ERRCODE = '40001';
  END IF;

  UPDATE public.financial_model_versions
     SET snapshot_json = COALESCE(p_snapshot, snapshot_json),
         key_metrics_json = COALESCE(p_key_metrics, key_metrics_json),
         scenario_name = COALESCE(p_scenario_name, scenario_name),
         updated_at = now()
   WHERE id = p_version_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_financial_scenario_atomic(uuid, timestamptz, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_financial_scenario_atomic(uuid, timestamptz, jsonb, jsonb, text)
  TO authenticated, service_role;

INSERT INTO public.feature_flags (key, enabled, scope, description)
SELECT 'business_plan_assistant_v2', false, 'global',
       'Guided Business Plan Assistant v2 — off pending legal + UX review.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags
   WHERE key = 'business_plan_assistant_v2' AND scope = 'global'
);
