
-- Batch C2: expand notification_attempts into a true outbox
ALTER TABLE public.notification_attempts
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS last_error_class text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;

-- Widen state check to canonical outbox vocabulary (keep permissive: existing rows may carry legacy values)
DO $$
DECLARE
  cn text;
BEGIN
  SELECT conname INTO cn
    FROM pg_constraint
   WHERE conrelid = 'public.notification_attempts'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%state%';
  IF cn IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notification_attempts DROP CONSTRAINT %I', cn);
  END IF;
END $$;

ALTER TABLE public.notification_attempts
  ADD CONSTRAINT notification_attempts_state_check
  CHECK (state IN (
    'queued','leased','delivered','failed_retryable','failed_terminal',
    -- legacy tolerated values
    'pending','sent','failed','skipped'
  ));

CREATE INDEX IF NOT EXISTS idx_notification_attempts_ready
  ON public.notification_attempts (next_attempt_at)
  WHERE state IN ('queued','failed_retryable');

CREATE INDEX IF NOT EXISTS idx_notification_attempts_lease
  ON public.notification_attempts (lease_expires_at)
  WHERE state = 'leased';

-- Atomic claim: lease up to p_limit rows for a worker
CREATE OR REPLACE FUNCTION public.claim_notification_attempts(
  p_owner text,
  p_lease_seconds integer DEFAULT 60,
  p_limit integer DEFAULT 25
)
RETURNS SETOF public.notification_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_owner IS NULL OR length(p_owner) = 0 THEN
    RAISE EXCEPTION 'owner required';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id
      FROM public.notification_attempts
     WHERE (
             (state IN ('queued','failed_retryable') AND next_attempt_at <= now())
             OR (state = 'leased' AND lease_expires_at < now())
           )
     ORDER BY next_attempt_at
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_attempts na
     SET state = 'leased',
         lease_owner = p_owner,
         lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 5)),
         attempt_no = COALESCE(na.attempt_no, 0) + 1,
         updated_at = now()
    FROM picked
   WHERE na.id = picked.id
  RETURNING na.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_attempts(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_attempts(text,integer,integer) TO service_role;

-- Mark delivered — only after provider confirms
CREATE OR REPLACE FUNCTION public.mark_notification_delivered(
  p_id uuid,
  p_provider_message_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notification_attempts
     SET state = 'delivered',
         delivered_at = now(),
         provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
         metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
         lease_owner = NULL,
         lease_expires_at = NULL,
         updated_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_delivered(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_delivered(uuid,text,jsonb) TO service_role;

-- Mark failure — retryable or terminal with exponential backoff
CREATE OR REPLACE FUNCTION public.mark_notification_failed(
  p_id uuid,
  p_error_class text,
  p_error_message text,
  p_retryable boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.notification_attempts%ROWTYPE;
  v_next timestamptz;
  v_terminal boolean;
BEGIN
  SELECT * INTO v_row FROM public.notification_attempts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_terminal := (NOT p_retryable) OR COALESCE(v_row.attempt_no, 0) >= COALESCE(v_row.max_attempts, 5);
  -- backoff: 30s * 2^(attempt-1), capped at 1h
  v_next := now() + make_interval(secs =>
    LEAST(3600, 30 * (2 ^ GREATEST(COALESCE(v_row.attempt_no,1) - 1, 0)))::int
  );

  UPDATE public.notification_attempts
     SET state = CASE WHEN v_terminal THEN 'failed_terminal' ELSE 'failed_retryable' END,
         last_error_class = p_error_class,
         error_message = p_error_message,
         next_attempt_at = CASE WHEN v_terminal THEN next_attempt_at ELSE v_next END,
         failed_at = CASE WHEN v_terminal THEN now() ELSE failed_at END,
         lease_owner = NULL,
         lease_expires_at = NULL,
         updated_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_failed(uuid,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_failed(uuid,text,text,boolean) TO service_role;
