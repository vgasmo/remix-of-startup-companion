CREATE OR REPLACE FUNCTION public.apply_contract_signature_atomic(
  p_command_id uuid,
  p_contract_id uuid,
  p_party text,
  p_to_status text,
  p_actor_user_id uuid,
  p_evidence jsonb,
  p_ip_hash text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_grant_nonce text DEFAULT NULL,
  p_document_sha256 text DEFAULT NULL,
  p_canonical_payload_sha256 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract      public.startup_contracts%ROWTYPE;
  v_grant         public.contract_signing_grants%ROWTYPE;
  v_existing_ev   public.contract_signature_events%ROWTYPE;
  v_fingerprint   text;
  v_new_founder   text;
  v_new_counter   text;
  v_new_signature text;
  v_signed_at     timestamptz;
  v_evidence      jsonb := COALESCE(p_evidence, '{}'::jsonb);
BEGIN
  IF p_command_id IS NULL OR p_contract_id IS NULL THEN
    RAISE EXCEPTION 'command_id and contract_id are required' USING ERRCODE = '22023';
  END IF;
  IF p_party NOT IN ('founder','counter_signer') THEN
    RAISE EXCEPTION 'invalid_party: %', p_party USING ERRCODE = '22023';
  END IF;

  IF p_grant_nonce IS NULL OR p_document_sha256 IS NULL THEN
    RAISE EXCEPTION 'signing_grant_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_grant
    FROM public.contract_signing_grants
   WHERE contract_id = p_contract_id
     AND party_role  = p_party
     AND nonce       = p_grant_nonce
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signing_grant_invalid' USING ERRCODE = '42501';
  END IF;
  IF v_grant.document_sha256 <> p_document_sha256 THEN
    RAISE EXCEPTION 'signing_grant_document_mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_grant.consumed_at IS NOT NULL
     AND v_grant.consumed_by_command_id IS DISTINCT FROM p_command_id THEN
    RAISE EXCEPTION 'signing_grant_already_consumed' USING ERRCODE = '42501';
  END IF;

  IF v_grant.consumed_at IS NULL AND v_grant.expires_at < now() THEN
    RAISE EXCEPTION 'signing_grant_expired' USING ERRCODE = '42501';
  END IF;

  -- Authorized replay of the same command (either the grant already recorded it,
  -- or a freshly minted grant carries a command that is already on file).
  SELECT * INTO v_existing_ev
    FROM public.contract_signature_events
   WHERE contract_id = p_contract_id AND command_id = p_command_id
   LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_contract FROM public.startup_contracts WHERE id = p_contract_id FOR SHARE;
    UPDATE public.contract_signing_grants
       SET consumed_at = COALESCE(consumed_at, now()),
           consumed_by_command_id = COALESCE(consumed_by_command_id, p_command_id)
     WHERE id = v_grant.id;
    RETURN jsonb_build_object(
      'idempotent', true,
      'event_id', v_existing_ev.id,
      'signature_status', v_contract.signature_status,
      'founder_signer_status', v_contract.founder_signer_status,
      'counter_signer_status', v_contract.counter_signer_status
    );
  END IF;

  IF v_grant.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'signing_grant_already_consumed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_contract FROM public.startup_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found: %', p_contract_id USING ERRCODE = 'P0002';
  END IF;

  v_evidence := v_evidence || jsonb_build_object(
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

  v_fingerprint := encode(
    digest(
      COALESCE(p_contract_id::text,'') || '|' ||
      COALESCE(p_party,'')             || '|' ||
      COALESCE(p_document_sha256,'')   || '|' ||
      COALESCE(p_canonical_payload_sha256,''),
      'sha256'
    ),
    'hex'
  );
  v_evidence := v_evidence || jsonb_build_object('command_fingerprint', v_fingerprint);

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
END $function$;