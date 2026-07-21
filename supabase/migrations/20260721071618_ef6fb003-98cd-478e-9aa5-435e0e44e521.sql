
CREATE OR REPLACE FUNCTION public.jsonb_deep_merge(a jsonb, b jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb;
  k text;
  v jsonb;
BEGIN
  IF a IS NULL THEN RETURN COALESCE(b, '{}'::jsonb); END IF;
  IF b IS NULL THEN RETURN a; END IF;
  IF jsonb_typeof(a) <> 'object' OR jsonb_typeof(b) <> 'object' THEN
    RETURN b;
  END IF;
  result := a;
  FOR k, v IN SELECT * FROM jsonb_each(b) LOOP
    IF result ? k
       AND jsonb_typeof(result -> k) = 'object'
       AND jsonb_typeof(v) = 'object' THEN
      result := jsonb_set(result, ARRAY[k], public.jsonb_deep_merge(result -> k, v));
    ELSE
      result := jsonb_set(result, ARRAY[k], v);
    END IF;
  END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.jsonb_deep_merge(jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.jsonb_deep_merge(jsonb, jsonb) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.crm_lead_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_filename text,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  committed_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'committing', 'committed', 'failed', 'expired')),
  plan_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.crm_lead_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.crm_lead_import_batches(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  row_hash text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  organization_name text,
  source text,
  notes text,
  deal_value numeric,
  valid boolean NOT NULL DEFAULT false,
  error text,
  committed_funnel_item_id uuid REFERENCES public.funnel_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_hash)
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_import_rows_batch
  ON public.crm_lead_import_rows(batch_id);

GRANT SELECT ON public.crm_lead_import_batches TO authenticated;
GRANT SELECT ON public.crm_lead_import_rows TO authenticated;
GRANT ALL ON public.crm_lead_import_batches TO service_role;
GRANT ALL ON public.crm_lead_import_rows TO service_role;

ALTER TABLE public.crm_lead_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read own crm lead batches" ON public.crm_lead_import_batches;
CREATE POLICY "staff read own crm lead batches"
  ON public.crm_lead_import_batches FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'consultor')
  );

DROP POLICY IF EXISTS "staff read crm lead rows" ON public.crm_lead_import_rows;
CREATE POLICY "staff read crm lead rows"
  ON public.crm_lead_import_rows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_lead_import_batches b
      WHERE b.id = crm_lead_import_rows.batch_id
        AND (
          b.created_by = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'consultor')
        )
    )
  );

CREATE TABLE IF NOT EXISTS public.public_booking_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL,
  ip_hash text,
  bucket_start timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  attempts integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_normalized, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_public_booking_rate_limits_email_recent
  ON public.public_booking_rate_limits (email_normalized, last_attempt_at DESC);

GRANT ALL ON public.public_booking_rate_limits TO service_role;

ALTER TABLE public.public_booking_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.first_contact_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_item_id uuid REFERENCES public.funnel_items(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('graph_event', 'consultant_email', 'founder_notification', 'consultant_notification')),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_first_contact_outbox_pending
  ON public.first_contact_outbox (next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_first_contact_outbox_funnel
  ON public.first_contact_outbox (funnel_item_id);

GRANT SELECT ON public.first_contact_outbox TO authenticated;
GRANT ALL ON public.first_contact_outbox TO service_role;

ALTER TABLE public.first_contact_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read first contact outbox" ON public.first_contact_outbox;
CREATE POLICY "staff read first contact outbox"
  ON public.first_contact_outbox FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'consultor')
  );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_funnel_items_idempotency_key
  ON public.funnel_items ((metadata_json ->> 'idempotency_key'))
  WHERE metadata_json ? 'idempotency_key';
