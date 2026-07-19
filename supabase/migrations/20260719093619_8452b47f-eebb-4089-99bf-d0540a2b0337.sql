CREATE TABLE IF NOT EXISTS public.notification_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_key text NOT NULL,
  channel text NOT NULL,
  subject_kind text NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_ledger_business_key_unique UNIQUE (business_key)
);

CREATE INDEX IF NOT EXISTS notification_ledger_kind_idx
  ON public.notification_ledger (subject_kind, delivered_at DESC);

GRANT SELECT ON public.notification_ledger TO authenticated;
GRANT ALL    ON public.notification_ledger TO service_role;

ALTER TABLE public.notification_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_ledger_admin_select"
  ON public.notification_ledger
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.notification_ledger IS
  'RC5 I2: idempotent send ledger. business_key is deterministic per delivery — insert with ON CONFLICT DO NOTHING before dispatch, skip send if already present.';