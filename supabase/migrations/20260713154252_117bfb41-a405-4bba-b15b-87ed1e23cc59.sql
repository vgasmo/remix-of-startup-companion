-- Webhook inbox: idempotency table for provider webhook deliveries.
-- Guarantees that duplicate, concurrent and out-of-order deliveries from
-- PandaDoc / DocuSign are safely deduplicated on either the provider's
-- native event id OR a stable SHA-256 hash of the raw request body.
--
-- Fail-closed replacement for the previous approach that fabricated event
-- ids via Date.now() (which made every replayed delivery look unique).

CREATE TABLE IF NOT EXISTS public.webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('docusign','pandadoc')),
  event_id text,                       -- provider-issued id; nullable when provider omits one
  payload_hash text NOT NULL,          -- sha256 hex of raw request body — always present
  event_name text,                     -- e.g. 'document.completed', 'envelope-completed'
  contract_id uuid,                    -- resolved contract, if any (no FK on purpose: rows may arrive before contract exists)
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','failed','duplicate')),
  http_status int,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  raw_body_preview text                -- first 2 KB for auditability
);

GRANT ALL ON public.webhook_inbox TO service_role;
-- No anon / authenticated grants: writes are edge-function only.

ALTER TABLE public.webhook_inbox ENABLE ROW LEVEL SECURITY;

-- Staff (admin / backoffice / consultor) can read for auditing.
CREATE POLICY "webhook_inbox: staff read"
  ON public.webhook_inbox FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'backoffice'::app_role)
    OR public.has_role(auth.uid(), 'consultor'::app_role)
  );

-- Uniqueness: prefer provider-issued event_id; fall back to payload hash
-- when the provider does not send one.
CREATE UNIQUE INDEX IF NOT EXISTS webhook_inbox_provider_event_id_uidx
  ON public.webhook_inbox (provider, event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_inbox_provider_payload_hash_uidx
  ON public.webhook_inbox (provider, payload_hash)
  WHERE event_id IS NULL;

CREATE INDEX IF NOT EXISTS webhook_inbox_contract_received_idx
  ON public.webhook_inbox (contract_id, received_at DESC);

CREATE INDEX IF NOT EXISTS webhook_inbox_provider_received_idx
  ON public.webhook_inbox (provider, received_at DESC);

COMMENT ON TABLE public.webhook_inbox IS
  'Idempotency inbox for signature-provider webhooks. Unique on (provider,event_id) when the provider supplies an id, otherwise on (provider,payload_hash). Never store synthesized Date.now-based ids here.';