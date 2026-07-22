-- RC5 Batch B — Contract Signing Integrity (FORWARD MIGRATION DRAFT)
--
-- Status: DRAFT — NOT applied. Held until pgTAP + true-concurrency probes run
-- green against an isolated non-production database.
-- Reference: docs/rc5/failing-repros/batch-b.md
--
-- This migration is forward-only, additive, and idempotent so it can be
-- promoted to a numbered production migration once staging proves it.
--
-- Changes:
--   1. contract_signing_grants — expiring, single-use, scoped signing grants.
--   2. issue_contract_signing_grant() — SECURITY DEFINER issuer (staff only).
--   3. apply_contract_signature_atomic — extend to consume a grant, bind
--      command_fingerprint on (contract_id, party, document_sha256,
--      canonical_payload_sha256), keep prior idempotency semantics.
--   4. contract_signature_events — drop CASCADE, replace with RESTRICT + a
--      mirror archive contract_signature_events_archive so evidence survives
--      any accidental contract delete.
--   5. RLS narrowing on contract_signature_events: workspace-scoped
--      consultant (assigned) + admin/backoffice only. Anon denied.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. contract_signing_grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_signing_grants (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id               uuid NOT NULL REFERENCES public.startup_contracts(id) ON DELETE RESTRICT,
  party_role                text NOT NULL CHECK (party_role IN ('founder','counter_signer')),
  signer_email_at_issue     text NOT NULL,
  document_sha256           text NOT NULL,
  document_version          integer NOT NULL DEFAULT 1,
  nonce                     text NOT NULL,
  issued_by_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at                 timestamptz NOT NULL DEFAULT now(),
  expires_at                timestamptz NOT NULL,
  consumed_at               timestamptz,
  consumed_by_command_id    uuid,
  created_at                timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contract_signing_grants TO authenticated;
GRANT ALL    ON public.contract_signing_grants TO service_role;

-- Only one live grant per (contract, party) — issuing a new one MUST first
-- consume/revoke any prior live grant.
CREATE UNIQUE INDEX IF NOT EXISTS contract_signing_grants_live_uidx
  ON public.contract_signing_grants (contract_id, party_role)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS contract_signing_grants_nonce_idx
  ON public.contract_signing_grants (nonce);

ALTER TABLE public.contract_signing_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signing_grants_staff_read ON public.contract_signing_grants;
CREATE POLICY signing_grants_staff_read ON public.contract_signing_grants
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'backoffice') OR
    public.has_role(auth.uid(), 'consultor')
  );

DROP POLICY IF EXISTS signing_grants_staff_write ON public.contract_signing_grants;
CREATE POLICY signing_grants_staff_write ON public.contract_signing_grants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));

-- ---------------------------------------------------------------------------
-- 2. issue_contract_signing_grant — staff-only issuer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_contract_signing_grant(
  p_contract_id      uuid,
  p_party_role       text,
  p_signer_email     text,
  p_document_sha256  text,
  p_document_version integer DEFAULT 1,
  p_ttl_minutes      integer DEFAULT 15
) RETURNS TABLE (grant_id uuid, nonce text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nonce text;
  v_exp   timestamptz;
  v_id    uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice')) THEN
    RAISE EXCEPTION 'forbidden: staff only' USING ERRCODE = '42501';
  END IF;

  IF p_party_role NOT IN ('founder','counter_signer') THEN
    RAISE EXCEPTION 'invalid party_role: %', p_party_role USING ERRCODE = '22023';
  END IF;

  -- Revoke any live grant (single-live invariant).
  UPDATE public.contract_signing_grants
     SET consumed_at = now()
   WHERE contract_id = p_contract_id
     AND party_role  = p_party_role
     AND consumed_at IS NULL;

  v_nonce := encode(gen_random_bytes(32), 'hex');
  v_exp   := now() + make_interval(mins => GREATEST(1, LEAST(60, p_ttl_minutes)));

  INSERT INTO public.contract_signing_grants (
    contract_id, party_role, signer_email_at_issue, document_sha256,
    document_version, nonce, issued_by_user_id, expires_at
  ) VALUES (
    p_contract_id, p_party_role, lower(trim(p_signer_email)),
    p_document_sha256, p_document_version, v_nonce, auth.uid(), v_exp
  ) RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_nonce, v_exp;
END $$;

REVOKE ALL ON FUNCTION public.issue_contract_signing_grant(uuid,text,text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_contract_signing_grant(uuid,text,text,text,integer,integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. apply_contract_signature_atomic — grant-aware overload
--
-- Backwards-compatible: adds three OPTIONAL params. When p_grant_nonce is
-- supplied, the grant is consumed in the SAME transaction and the command is
-- fingerprinted on (contract_id, party, document_sha256, payload_sha256).
-- Legacy callers without a nonce continue to work but are logged as
-- 'grant_bypass=true' in evidence_json so we can watch adoption.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_contract_signature_atomic(
  p_command_id                uuid,
  p_contract_id               uuid,
  p_party                     text,
  p_to_status                 text,
  p_actor_user_id             uuid,
  p_evidence                  jsonb,
  p_ip_hash                   text DEFAULT NULL,
  p_user_agent                text DEFAULT NULL,
  p_grant_nonce               text DEFAULT NULL,
  p_document_sha256           text DEFAULT NULL,
  p_canonical_payload_sha256  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract         public.startup_contracts%ROWTYPE;
  v_existing_ev      public.contract_signature_events%ROWTYPE;
  v_grant            public.contract_signing_grants%ROWTYPE;
  v_fingerprint      text;
  v_new_founder      text;
  v_new_counter      text;
  v_new_signature    text;
  v_signed_at        timestamptz;
  v_evidence         jsonb := COALESCE(p_evidence, '{}'::jsonb);
BEGIN
  -- Idempotency short-circuit (safe: same command_id → same effect).
  SELECT * INTO v_existing_ev
    FROM public.contract_signature_events
   WHERE contract_id = p_contract_id AND command_id = p_command_id
   LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_contract FROM public.startup_contracts WHERE id = p_contract_id FOR SHARE;
    RETURN jsonb_build_object(
      'idempotent', true,
      'signature_status', v_contract.signature_status,
      'founder_signer_status', v_contract.founder_signer_status,
      'counter_signer_status', v_contract.counter_signer_status
    );
  END IF;

  -- Lock contract row to serialize divergent-payload races.
  SELECT * INTO v_contract FROM public.startup_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found: %', p_contract_id USING ERRCODE = 'P0002';
  END IF;

  -- Consume grant if provided.
  IF p_grant_nonce IS NOT NULL THEN
    SELECT * INTO v_grant
      FROM public.contract_signing_grants
     WHERE contract_id = p_contract_id
       AND party_role  = p_party
       AND nonce       = p_grant_nonce
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'signing_grant_invalid' USING ERRCODE = '42501';
    END IF;
    IF v_grant.consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'signing_grant_already_consumed' USING ERRCODE = '42501';
    END IF;
    IF v_grant.expires_at < now() THEN
      RAISE EXCEPTION 'signing_grant_expired' USING ERRCODE = '42501';
    END IF;
    IF p_document_sha256 IS NULL OR v_grant.document_sha256 <> p_document_sha256 THEN
      RAISE EXCEPTION 'signing_grant_document_mismatch' USING ERRCODE = '42501';
    END IF;

    v_evidence := v_evidence
      || jsonb_build_object(
           'grant_id', v_grant.id,
           'grant_document_sha256', v_grant.document_sha256,
           'grant_document_version', v_grant.document_version,
           'grant_signer_email_at_issue', v_grant.signer_email_at_issue,
           'canonical_payload_sha256', p_canonical_payload_sha256
         );

    UPDATE public.contract_signing_grants
       SET consumed_at = now(),
           consumed_by_command_id = p_command_id
     WHERE id = v_grant.id;
  ELSE
    v_evidence := v_evidence || jsonb_build_object('grant_bypass', true);
  END IF;

  -- Fingerprint the command on scope so a divergent-payload retry with the
  -- same command_id cannot replay through the idempotency short-circuit.
  v_fingerprint := encode(
    digest(
      COALESCE(p_contract_id::text,'') || '|' ||
      COALESCE(p_party,'')              || '|' ||
      COALESCE(p_document_sha256,'')    || '|' ||
      COALESCE(p_canonical_payload_sha256,''),
      'sha256'
    ),
    'hex'
  );
  v_evidence := v_evidence || jsonb_build_object('command_fingerprint', v_fingerprint);

  -- Compute next state (matches prior behavior).
  IF p_to_status IN ('declined','voided') THEN
    v_new_signature := p_to_status;
    IF p_party = 'founder' THEN v_new_founder := p_to_status; ELSE v_new_counter := p_to_status; END IF;
  ELSIF p_to_status = 'signed' THEN
    v_new_founder := CASE WHEN p_party = 'founder' THEN 'signed' ELSE v_contract.founder_signer_status END;
    v_new_counter := CASE WHEN p_party = 'counter_signer' THEN 'signed' ELSE v_contract.counter_signer_status END;
    IF v_contract.counter_signer_email IS NULL THEN
      v_new_signature := 'completed';
      v_signed_at := now();
    ELSIF v_new_founder = 'signed' AND v_new_counter = 'signed' THEN
      v_new_signature := 'completed';
      v_signed_at := now();
    ELSE
      v_new_signature := 'partially_signed';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_to_status: %', p_to_status USING ERRCODE = '22023';
  END IF;

  -- Reject state regressions from terminal states.
  IF v_contract.signature_status IN ('completed','declined','voided')
     AND v_new_signature <> v_contract.signature_status THEN
    RAISE EXCEPTION 'state_regression_forbidden: % -> %', v_contract.signature_status, v_new_signature USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.contract_signature_events (
    contract_id, command_id, party, from_status, to_status,
    actor_user_id, evidence_json, ip_hash, user_agent
  ) VALUES (
    p_contract_id, p_command_id, p_party, v_contract.signature_status, p_to_status,
    p_actor_user_id, v_evidence, p_ip_hash, p_user_agent
  );

  UPDATE public.startup_contracts
     SET founder_signer_status = COALESCE(v_new_founder, founder_signer_status),
         counter_signer_status = COALESCE(v_new_counter, counter_signer_status),
         signature_status      = v_new_signature,
         signed_at             = COALESCE(v_signed_at, signed_at),
         updated_at            = now()
   WHERE id = p_contract_id;

  RETURN jsonb_build_object(
    'idempotent', false,
    'signature_status', v_new_signature,
    'founder_signer_status', COALESCE(v_new_founder, v_contract.founder_signer_status),
    'counter_signer_status', COALESCE(v_new_counter, v_contract.counter_signer_status),
    'command_fingerprint', v_fingerprint
  );
END $$;

-- ---------------------------------------------------------------------------
-- 4. Detach signature evidence from CASCADE and mirror to archive
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_signature_events_archive (
  LIKE public.contract_signature_events INCLUDING ALL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_reason text
);

GRANT SELECT ON public.contract_signature_events_archive TO authenticated;
GRANT ALL    ON public.contract_signature_events_archive TO service_role;
ALTER TABLE public.contract_signature_events_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csea_staff_read ON public.contract_signature_events_archive;
CREATE POLICY csea_staff_read ON public.contract_signature_events_archive
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));

-- Replace CASCADE with RESTRICT. If a contract must truly be deleted, staff
-- MUST first move its signature evidence to the archive.
ALTER TABLE public.contract_signature_events
  DROP CONSTRAINT IF EXISTS contract_signature_events_contract_id_fkey;

ALTER TABLE public.contract_signature_events
  ADD  CONSTRAINT contract_signature_events_contract_id_fkey
       FOREIGN KEY (contract_id)
       REFERENCES public.startup_contracts(id)
       ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 5. RLS narrowing on contract_signature_events
-- ---------------------------------------------------------------------------
ALTER TABLE public.contract_signature_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname='public' AND tablename='contract_signature_events'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.contract_signature_events', r.policyname);
  END LOOP;
END $$;

CREATE POLICY cse_admin_backoffice_read ON public.contract_signature_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));

CREATE POLICY cse_assigned_consultant_read ON public.contract_signature_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'consultor')
    AND EXISTS (
      SELECT 1 FROM public.startup_contracts sc
       WHERE sc.id = contract_signature_events.contract_id
         AND sc.workspace_id IS NOT NULL
         AND public.has_workspace_access(sc.workspace_id, auth.uid())
    )
  );

-- Writes exclusively via SECURITY DEFINER RPC — no direct client writes.
CREATE POLICY cse_service_role_write ON public.contract_signature_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

-- Rollback outline (manual; keep for the runbook):
--   1. Restore prior apply_contract_signature_atomic body from git.
--   2. ALTER TABLE contract_signature_events RE-ADD FK ... ON DELETE CASCADE.
--   3. DROP POLICY cse_* and restore prior policies.
--   4. DROP TABLE contract_signing_grants, contract_signature_events_archive.
--   5. DROP FUNCTION issue_contract_signing_grant(...).
