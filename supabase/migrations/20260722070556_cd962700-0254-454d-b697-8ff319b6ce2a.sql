
-- RC5 Batch C: atomic envelope claim + finalize + release for DocuSign idempotency
-- All functions are SECURITY DEFINER, invoked by the edge function (service role)
-- or by the reconciliation harness. RLS on startup_contracts is unaffected.

CREATE OR REPLACE FUNCTION public.claim_docusign_envelope(
  p_contract_id uuid,
  p_command_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.startup_contracts%ROWTYPE;
BEGIN
  IF p_contract_id IS NULL OR p_command_id IS NULL OR length(p_command_id) = 0 THEN
    RAISE EXCEPTION 'contract_id and command_id are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.startup_contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract not found: %', p_contract_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Same command replayed after a successful dispatch → idempotent hit.
  IF v_row.envelope_command_id = p_command_id
     AND v_row.docusign_envelope_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'idempotent', true,
      'envelope_id', v_row.docusign_envelope_id,
      'signature_status', v_row.signature_status
    );
  END IF;

  -- Different command id already stamped → concurrent or stale caller.
  IF v_row.envelope_command_id IS NOT NULL
     AND v_row.envelope_command_id <> p_command_id THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'conflict', 'different_command',
      'existing_command_id', v_row.envelope_command_id,
      'envelope_id', v_row.docusign_envelope_id,
      'signature_status', v_row.signature_status
    );
  END IF;

  -- Contract is already live/terminal (envelope id set, non-resendable status).
  IF v_row.docusign_envelope_id IS NOT NULL
     AND coalesce(v_row.signature_status, '') NOT IN (
       'draft','failed','ready_to_send','pending_manual'
     ) THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'conflict', 'already_live',
      'envelope_id', v_row.docusign_envelope_id,
      'signature_status', v_row.signature_status
    );
  END IF;

  -- Claim: stamp command_id + move to dispatching. Same-command retry after a
  -- crash falls through here too and re-stamps identical values.
  UPDATE public.startup_contracts
  SET envelope_command_id = p_command_id,
      signature_status = 'dispatching',
      provider_last_error = NULL,
      provider_last_sync_at = now()
  WHERE id = p_contract_id;

  RETURN jsonb_build_object(
    'claimed', true,
    'idempotent', false,
    'previous_status', v_row.signature_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_docusign_envelope(
  p_contract_id uuid,
  p_command_id text,
  p_envelope_id text,
  p_signer_email text DEFAULT NULL,
  p_counter_signer_name text DEFAULT NULL,
  p_counter_signer_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_contract_id IS NULL OR p_command_id IS NULL OR p_envelope_id IS NULL THEN
    RAISE EXCEPTION 'contract_id, command_id and envelope_id are required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.startup_contracts
  SET docusign_envelope_id = p_envelope_id,
      provider_document_id = p_envelope_id,
      signature_provider = 'docusign',
      signature_status = 'sent_for_signature',
      signature_requested_at = coalesce(signature_requested_at, now()),
      provider_sent_at = now(),
      provider_last_event = 'envelope-sent',
      provider_last_sync_at = now(),
      provider_last_error = NULL,
      founder_signer_status = 'sent',
      counter_signer_name = coalesce(p_counter_signer_name, counter_signer_name),
      counter_signer_email = coalesce(p_counter_signer_email, counter_signer_email),
      counter_signer_status = CASE
        WHEN coalesce(p_counter_signer_email, counter_signer_email) IS NOT NULL
          THEN 'pending'
        ELSE counter_signer_status
      END
  WHERE id = p_contract_id
    AND envelope_command_id = p_command_id
    AND (docusign_envelope_id IS NULL OR docusign_envelope_id = p_envelope_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'command_mismatch_or_already_finalized');
  END IF;

  RETURN jsonb_build_object('finalized', true, 'envelope_id', p_envelope_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_docusign_envelope_command(
  p_contract_id uuid,
  p_command_id text,
  p_error text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.startup_contracts
  SET envelope_command_id = NULL,
      signature_status = 'failed',
      provider_last_error = left(coalesce(p_error, 'dispatch_failed'), 500),
      provider_last_sync_at = now()
  WHERE id = p_contract_id
    AND envelope_command_id = p_command_id
    AND docusign_envelope_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('released', v_updated > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_docusign_envelope(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_docusign_envelope(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_docusign_envelope_command(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_docusign_envelope(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_docusign_envelope(uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_docusign_envelope_command(uuid, text, text) TO service_role;
