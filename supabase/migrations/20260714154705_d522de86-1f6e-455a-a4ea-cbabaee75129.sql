CREATE OR REPLACE FUNCTION public.staff_rotate_intake_token(p_intake_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can rotate intake tokens';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.contract_intakes
  SET intake_token_hash = public.sha256_token(v_token),
      intake_token_expires_at = now() + interval '30 days',
      updated_at = now()
  WHERE id = p_intake_id;

  RETURN v_token;
END;
$$;