ALTER TABLE public.startup_contracts
  ADD COLUMN IF NOT EXISTS envelope_command_id text;

CREATE UNIQUE INDEX IF NOT EXISTS startup_contracts_envelope_command_uidx
  ON public.startup_contracts(envelope_command_id)
  WHERE envelope_command_id IS NOT NULL;

COMMENT ON COLUMN public.startup_contracts.envelope_command_id IS
  'Deterministic idempotency key for DocuSign envelope creation. Set once when the send flow first reaches the provider; reused on retry to avoid duplicate envelopes.';