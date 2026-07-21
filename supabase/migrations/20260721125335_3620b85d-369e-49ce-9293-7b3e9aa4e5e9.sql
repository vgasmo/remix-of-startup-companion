
-- ============================================================================
-- Batch B2 — Contract signature audit + atomic RPC
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contract_signature_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.startup_contracts(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  party text NOT NULL CHECK (party IN ('founder','counter_signer')),
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('sent','signed','declined','voided')),
  actor_user_id uuid,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contract_signature_events TO authenticated;
GRANT ALL ON public.contract_signature_events TO service_role;

ALTER TABLE public.contract_signature_events ENABLE ROW LEVEL SECURITY;

-- Idempotency: one row per (contract, command). Collapses concurrent retries.
CREATE UNIQUE INDEX IF NOT EXISTS contract_signature_events_command_unique
  ON public.contract_signature_events (contract_id, command_id);

CREATE INDEX IF NOT EXISTS contract_signature_events_contract_idx
  ON public.contract_signature_events (contract_id, created_at DESC);

DROP POLICY IF EXISTS "Staff can read signature events" ON public.contract_signature_events;
CREATE POLICY "Staff can read signature events"
ON public.contract_signature_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'consultor')
  OR public.has_role(auth.uid(), 'backoffice')
);

-- Only service role writes signature events (via RPC / edge functions).
DROP POLICY IF EXISTS "Service role writes signature events" ON public.contract_signature_events;
CREATE POLICY "Service role writes signature events"
ON public.contract_signature_events
FOR INSERT
TO service_role
WITH CHECK (true);

-- --------------------------------------------------------------------------
-- Atomic signature RPC. All multi-write logic guarded by a single command_id.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_contract_signature_atomic(
  p_command_id uuid,
  p_contract_id uuid,
  p_party text,
  p_to_status text,
  p_actor_user_id uuid DEFAULT NULL,
  p_evidence jsonb DEFAULT '{}'::jsonb,
  p_ip_hash text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract record;
  v_existing_event uuid;
  v_from_status text;
  v_new_founder text;
  v_new_counter text;
  v_new_overall text;
  v_now timestamptz := now();
BEGIN
  IF p_command_id IS NULL OR p_contract_id IS NULL THEN
    RAISE EXCEPTION 'command_id and contract_id are required';
  END IF;

  IF p_party NOT IN ('founder','counter_signer') THEN
    RAISE EXCEPTION 'invalid party: %', p_party;
  END IF;

  IF p_to_status NOT IN ('sent','signed','declined','voided') THEN
    RAISE EXCEPTION 'invalid to_status: %', p_to_status;
  END IF;

  -- Idempotency: if this exact command already recorded, return the effect.
  SELECT id INTO v_existing_event
  FROM public.contract_signature_events
  WHERE contract_id = p_contract_id AND command_id = p_command_id
  LIMIT 1;

  IF v_existing_event IS NOT NULL THEN
    SELECT signature_status, founder_signer_status, counter_signer_status
      INTO v_new_overall, v_new_founder, v_new_counter
    FROM public.startup_contracts
    WHERE id = p_contract_id;

    RETURN jsonb_build_object(
      'idempotent', true,
      'event_id', v_existing_event,
      'signature_status', v_new_overall,
      'founder_signer_status', v_new_founder,
      'counter_signer_status', v_new_counter
    );
  END IF;

  -- Lock the contract row so concurrent parties don't clobber each other.
  SELECT *
    INTO v_contract
  FROM public.startup_contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'contract % not found', p_contract_id;
  END IF;

  IF p_party = 'founder' THEN
    v_from_status := v_contract.founder_signer_status;
    v_new_founder := p_to_status;
    v_new_counter := v_contract.counter_signer_status;
  ELSE
    v_from_status := v_contract.counter_signer_status;
    v_new_founder := v_contract.founder_signer_status;
    v_new_counter := p_to_status;
  END IF;

  -- State-matrix guard: only allow monotonic forward transitions.
  IF v_from_status = 'signed' AND p_to_status IN ('sent') THEN
    RAISE EXCEPTION 'cannot revert signed % to %', p_party, p_to_status;
  END IF;
  IF v_from_status IN ('declined','voided') THEN
    RAISE EXCEPTION '% already in terminal state %', p_party, v_from_status;
  END IF;

  -- Recompute overall signature_status.
  IF p_to_status = 'voided' THEN
    v_new_overall := 'voided';
  ELSIF p_to_status = 'declined' THEN
    v_new_overall := 'declined';
  ELSIF v_new_founder = 'signed' AND (v_new_counter = 'signed' OR v_new_counter IS NULL) THEN
    v_new_overall := 'completed';
  ELSIF v_new_founder = 'signed' OR v_new_counter = 'signed' THEN
    v_new_overall := 'partially_signed';
  ELSE
    v_new_overall := COALESCE(v_contract.signature_status, 'sent_for_signature');
  END IF;

  UPDATE public.startup_contracts
     SET founder_signer_status = v_new_founder,
         counter_signer_status = v_new_counter,
         signature_status = v_new_overall,
         signed_at = CASE WHEN v_new_overall = 'completed' THEN COALESCE(signed_at, v_now) ELSE signed_at END,
         provider_last_event = format('signature.%s.%s', p_party, p_to_status),
         provider_last_sync_at = v_now,
         updated_at = v_now
   WHERE id = p_contract_id;

  INSERT INTO public.contract_signature_events (
    contract_id, command_id, party, from_status, to_status,
    actor_user_id, evidence_json, ip_hash, user_agent
  ) VALUES (
    p_contract_id, p_command_id, p_party, v_from_status, p_to_status,
    p_actor_user_id, COALESCE(p_evidence, '{}'::jsonb), p_ip_hash, p_user_agent
  );

  RETURN jsonb_build_object(
    'idempotent', false,
    'signature_status', v_new_overall,
    'founder_signer_status', v_new_founder,
    'counter_signer_status', v_new_counter,
    'from_status', v_from_status,
    'to_status', p_to_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_contract_signature_atomic(uuid, uuid, text, text, uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_contract_signature_atomic(uuid, uuid, text, text, uuid, jsonb, text, text) TO service_role;

-- ============================================================================
-- Batch B3 — Profiles peer view (public-safe fields only)
-- ============================================================================
-- Exposes minimal fields any authenticated user can safely see when rendering
-- peer chips (avatars, names) without leaking email / phone / notes.
CREATE OR REPLACE VIEW public.profiles_peer_view
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.full_name,
  p.avatar_url,
  (
    SELECT ur.role::text
    FROM public.user_roles ur
    WHERE ur.user_id = p.id
    ORDER BY CASE ur.role::text
               WHEN 'admin' THEN 1
               WHEN 'backoffice' THEN 2
               WHEN 'consultor' THEN 3
               WHEN 'mentor' THEN 4
               WHEN 'founder' THEN 5
               ELSE 9
             END
    LIMIT 1
  ) AS role_public
FROM public.profiles p;

GRANT SELECT ON public.profiles_peer_view TO authenticated;

COMMENT ON VIEW public.profiles_peer_view IS
  'Public-safe peer view: {id, full_name, avatar_url, role_public}. Never exposes email / phone / notes. Use for chips, avatars, participant pickers.';
