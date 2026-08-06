-- Security fix: the staff gate used a three-valued expression. With no JWT
-- claim present, `v_jwt_role = 'service_role'` is NULL, so
-- `IF NOT (NULL OR false OR false)` evaluated to NULL and the guard was SKIPPED.
-- Force a boolean so "unknown identity" means refuse.
CREATE OR REPLACE FUNCTION public.issue_contract_signing_grant(
  p_contract_id uuid,
  p_party_role text,
  p_signer_email text,
  p_document_sha256 text,
  p_document_version integer DEFAULT 1,
  p_ttl_minutes integer DEFAULT 15
)
RETURNS TABLE(grant_id uuid, nonce text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_nonce text;
  v_exp   timestamptz;
  v_id    uuid;
  v_jwt_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    ''
  );
BEGIN
  IF NOT COALESCE(
       v_jwt_role = 'service_role'
       OR public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'backoffice'::public.app_role),
       false
     ) THEN
    RAISE EXCEPTION 'forbidden: staff only' USING ERRCODE = '42501';
  END IF;

  IF p_party_role NOT IN ('founder','counter_signer') THEN
    RAISE EXCEPTION 'invalid party_role: %', p_party_role USING ERRCODE = '22023';
  END IF;

  IF p_document_sha256 IS NULL OR length(p_document_sha256) <> 64 THEN
    RAISE EXCEPTION 'document_sha256 must be a 64-char hex digest' USING ERRCODE = '22023';
  END IF;

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
END $function$;