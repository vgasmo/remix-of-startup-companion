ALTER TABLE public.incubation_types
  ADD COLUMN IF NOT EXISTS auto_renewal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_months integer NOT NULL DEFAULT 12;

CREATE OR REPLACE FUNCTION public.staff_rotate_intake_token(p_intake_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token text;
BEGIN
  -- Staff users, or trusted server-side callers using the service role
  -- (scheduled reminder jobs have no authenticated user).
  IF NOT (public.is_staff() OR coalesce(auth.role(), '') = 'service_role') THEN
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
$function$;