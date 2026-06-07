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
  SET intake_token_hash = public.sha256_token(v_token),
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
  SET onboarding_token_hash = public.sha256_token(v_token),
      onboarding_token_expires_at = now() + interval '14 days',
      updated_at = now()
  WHERE id = p_contract_id;

  RETURN v_token;
END;
$$;

DROP TRIGGER IF EXISTS trg_hash_intake_token ON public.contract_intakes;
DROP TRIGGER IF EXISTS trg_hash_onboarding_token ON public.startup_contracts;
DROP FUNCTION IF EXISTS public.hash_intake_token() CASCADE;
DROP FUNCTION IF EXISTS public.hash_onboarding_token() CASCADE;

ALTER TABLE public.contract_intakes DROP COLUMN IF EXISTS intake_token;
ALTER TABLE public.startup_contracts DROP COLUMN IF EXISTS onboarding_token;