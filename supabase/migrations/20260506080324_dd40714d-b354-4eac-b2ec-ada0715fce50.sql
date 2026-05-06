
-- Helper: generate a 32-byte hex token and rotate the intake token hash
CREATE OR REPLACE FUNCTION public.staff_rotate_intake_token(p_intake_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can rotate intake tokens';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  UPDATE public.contract_intakes
  SET intake_token = v_token,           -- trigger hashes & nulls the plaintext
      intake_token_expires_at = now() + interval '30 days',
      updated_at = now()
  WHERE id = p_intake_id;

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_rotate_onboarding_token(p_contract_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can rotate onboarding tokens';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  UPDATE public.startup_contracts
  SET onboarding_token = v_token,       -- trigger hashes & nulls the plaintext
      onboarding_token_expires_at = now() + interval '14 days',
      updated_at = now()
  WHERE id = p_contract_id;

  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_rotate_intake_token(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_rotate_onboarding_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_rotate_intake_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_rotate_onboarding_token(uuid) TO authenticated;
