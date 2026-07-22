-- ============================================================================
-- Batch C — DocuSign Exactly-Once Delivery (forward-only migration draft)
-- ----------------------------------------------------------------------------
-- Status: DRAFT — not yet applied to production. Ships to staging first for
-- the mocked-provider vitest + true-concurrency Node probe.
--
-- Introduces an explicit dispatch-lease state machine so that:
--   * At most one worker can hold the send lease per command_id.
--   * Provider idempotency key is bound to sha256(command_id || document_sha256)
--     rather than command_id alone — protects against payload drift.
--   * Ambiguous provider timeouts are recorded as `unknown`, forcing a
--     reconciliation call before any resend.
--   * Finalize is monotonic on (command_id, envelope_id); repeated webhook
--     deliveries never overwrite provider_sent_at.
--   * Stale leases (expires_at < now) can be reclaimed with a capped attempt
--     counter + exponential backoff, after reconciliation confirms provider
--     state.
--   * Operators see the lease state on the contract row.
-- ============================================================================

BEGIN;

-- 1. Lease table --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.docusign_dispatch_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id TEXT NOT NULL,
  contract_id UUID NOT NULL REFERENCES public.startup_contracts(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL,               -- edge instance / worker identifier
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'claimed','in_flight','unknown','sent','completed','failed_terminal'
  )),
  attempts INT NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 5),
  document_sha256 TEXT,                 -- bound provider idempotency material
  provider_idempotency_key TEXT,        -- sha256(command_id || document_sha256)
  envelope_id TEXT,
  last_error TEXT,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS docusign_dispatch_leases_command_uidx
  ON public.docusign_dispatch_leases(command_id);
CREATE INDEX IF NOT EXISTS docusign_dispatch_leases_contract_idx
  ON public.docusign_dispatch_leases(contract_id);
CREATE INDEX IF NOT EXISTS docusign_dispatch_leases_state_expiry_idx
  ON public.docusign_dispatch_leases(state, expires_at)
  WHERE state IN ('claimed','in_flight','unknown');

GRANT SELECT ON public.docusign_dispatch_leases TO authenticated;
GRANT ALL ON public.docusign_dispatch_leases TO service_role;
ALTER TABLE public.docusign_dispatch_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read lease state"
  ON public.docusign_dispatch_leases
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'consultor')
    OR public.has_role(auth.uid(), 'backoffice')
  );

-- Service role bypasses RLS by definition; leases are mutated exclusively by
-- SECURITY DEFINER RPCs invoked from the edge function.

-- 2. Claim RPC ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_docusign_dispatch_lease(
  p_contract_id UUID,
  p_command_id TEXT,
  p_owner_id TEXT,
  p_lease_seconds INT DEFAULT 90,
  p_document_sha256 TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.docusign_dispatch_leases%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_owner_id IS NULL OR length(p_owner_id) = 0 THEN
    RAISE EXCEPTION 'owner_id required';
  END IF;

  -- Row lock on existing lease if any
  SELECT * INTO v_existing
  FROM public.docusign_dispatch_leases
  WHERE command_id = p_command_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.docusign_dispatch_leases(
      command_id, contract_id, owner_id, claimed_at, expires_at, state, attempts,
      document_sha256, provider_idempotency_key
    ) VALUES (
      p_command_id, p_contract_id, p_owner_id, v_now,
      v_now + make_interval(secs => p_lease_seconds),
      'claimed', 1, p_document_sha256,
      CASE
        WHEN p_document_sha256 IS NULL THEN NULL
        ELSE encode(digest(p_command_id || ':' || p_document_sha256, 'sha256'), 'hex')
      END
    );
    RETURN jsonb_build_object('claimed', true, 'attempts', 1);
  END IF;

  -- Terminal states are never reclaimable
  IF v_existing.state IN ('sent','completed','failed_terminal') THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'idempotent', v_existing.state IN ('sent','completed'),
      'state', v_existing.state,
      'envelope_id', v_existing.envelope_id
    );
  END IF;

  -- Fresh, non-terminal lease held by another owner
  IF v_existing.expires_at > v_now AND v_existing.owner_id <> p_owner_id THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'conflict', 'lease_held',
      'owner_id', v_existing.owner_id,
      'expires_at', v_existing.expires_at,
      'state', v_existing.state
    );
  END IF;

  -- Stale lease OR same owner re-entrance: require reconciliation for stale.
  IF v_existing.expires_at <= v_now AND v_existing.reconciled_at IS NULL THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'requires_reconciliation', true,
      'state', v_existing.state,
      'attempts', v_existing.attempts,
      'envelope_id', v_existing.envelope_id
    );
  END IF;

  IF v_existing.attempts >= 5 THEN
    UPDATE public.docusign_dispatch_leases
       SET state = 'failed_terminal', updated_at = v_now
     WHERE id = v_existing.id;
    RETURN jsonb_build_object('claimed', false, 'exhausted', true, 'state', 'failed_terminal');
  END IF;

  UPDATE public.docusign_dispatch_leases
     SET owner_id = p_owner_id,
         claimed_at = v_now,
         expires_at = v_now + make_interval(secs => p_lease_seconds),
         state = 'claimed',
         attempts = v_existing.attempts + 1,
         document_sha256 = COALESCE(p_document_sha256, v_existing.document_sha256),
         provider_idempotency_key = COALESCE(
           v_existing.provider_idempotency_key,
           CASE
             WHEN p_document_sha256 IS NULL THEN NULL
             ELSE encode(digest(p_command_id || ':' || p_document_sha256, 'sha256'), 'hex')
           END
         ),
         reconciled_at = NULL,
         last_error = NULL,
         updated_at = v_now
   WHERE id = v_existing.id;

  RETURN jsonb_build_object(
    'claimed', true,
    'reclaimed', true,
    'attempts', v_existing.attempts + 1,
    'provider_idempotency_key', COALESCE(
      v_existing.provider_idempotency_key,
      encode(digest(p_command_id || ':' || COALESCE(p_document_sha256, ''), 'sha256'), 'hex')
    )
  );
END;
$$;

-- 3. Mark in-flight (before provider call) -----------------------------------
CREATE OR REPLACE FUNCTION public.mark_docusign_dispatch_in_flight(
  p_command_id TEXT,
  p_owner_id TEXT
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.docusign_dispatch_leases
     SET state = 'in_flight', updated_at = now()
   WHERE command_id = p_command_id
     AND owner_id = p_owner_id
     AND state = 'claimed'
  RETURNING true;
$$;

-- 4. Timeout / ambiguous outcome — becomes 'unknown' -------------------------
CREATE OR REPLACE FUNCTION public.mark_docusign_dispatch_unknown(
  p_command_id TEXT,
  p_owner_id TEXT,
  p_error TEXT
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.docusign_dispatch_leases
     SET state = 'unknown',
         last_error = p_error,
         updated_at = now()
   WHERE command_id = p_command_id
     AND owner_id = p_owner_id
     AND state IN ('claimed','in_flight')
  RETURNING true;
$$;

-- 5. Monotonic finalize -------------------------------------------------------
-- Envelope id is stamped exactly once; provider_sent_at is preserved on replay.
CREATE OR REPLACE FUNCTION public.finalize_docusign_dispatch_lease(
  p_command_id TEXT,
  p_owner_id TEXT,
  p_envelope_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.docusign_dispatch_leases%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.docusign_dispatch_leases
  WHERE command_id = p_command_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'no_lease');
  END IF;

  IF v_row.state IN ('sent','completed','failed_terminal') THEN
    -- Idempotent replay: never regress state or overwrite envelope_id.
    RETURN jsonb_build_object(
      'finalized', false,
      'reason', 'already_terminal',
      'state', v_row.state,
      'envelope_id', v_row.envelope_id
    );
  END IF;

  IF v_row.owner_id <> p_owner_id THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'owner_mismatch');
  END IF;

  UPDATE public.docusign_dispatch_leases
     SET state = 'sent',
         envelope_id = p_envelope_id,
         updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('finalized', true, 'envelope_id', p_envelope_id);
END;
$$;

-- 6. Reconciliation confirmation (called after provider status API check) ----
CREATE OR REPLACE FUNCTION public.reconcile_docusign_dispatch_lease(
  p_command_id TEXT,
  p_envelope_id TEXT,
  p_provider_state TEXT  -- 'sent' | 'completed' | 'not_found' | 'voided' | 'declined'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.docusign_dispatch_leases%ROWTYPE;
  v_new_state TEXT;
BEGIN
  SELECT * INTO v_row
  FROM public.docusign_dispatch_leases
  WHERE command_id = p_command_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('reconciled', false, 'reason', 'no_lease');
  END IF;

  v_new_state := CASE p_provider_state
    WHEN 'completed' THEN 'completed'
    WHEN 'sent' THEN 'sent'
    WHEN 'not_found' THEN 'claimed'   -- allow reclaim next attempt
    WHEN 'voided' THEN 'failed_terminal'
    WHEN 'declined' THEN 'failed_terminal'
    ELSE v_row.state
  END;

  UPDATE public.docusign_dispatch_leases
     SET state = v_new_state,
         envelope_id = COALESCE(p_envelope_id, v_row.envelope_id),
         reconciled_at = now(),
         updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'reconciled', true,
    'state', v_new_state,
    'envelope_id', COALESCE(p_envelope_id, v_row.envelope_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_docusign_dispatch_lease(UUID, TEXT, TEXT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_docusign_dispatch_in_flight(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_docusign_dispatch_unknown(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_docusign_dispatch_lease(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_docusign_dispatch_lease(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_docusign_dispatch_lease(UUID, TEXT, TEXT, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_docusign_dispatch_in_flight(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_docusign_dispatch_unknown(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_docusign_dispatch_lease(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_docusign_dispatch_lease(TEXT, TEXT, TEXT) TO service_role;

-- 7. updated_at trigger -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.docusign_dispatch_leases_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_docusign_dispatch_leases_touch ON public.docusign_dispatch_leases;
CREATE TRIGGER trg_docusign_dispatch_leases_touch
BEFORE UPDATE ON public.docusign_dispatch_leases
FOR EACH ROW EXECUTE FUNCTION public.docusign_dispatch_leases_touch_updated_at();

COMMIT;
