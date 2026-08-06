ALTER FUNCTION public.apply_contract_signature_atomic(uuid, uuid, text, text, uuid, jsonb, text, text, text, text, text)
  SET search_path = public, extensions;

ALTER FUNCTION public.issue_contract_signing_grant(uuid, text, text, text, integer, integer)
  SET search_path = public, extensions;

ALTER FUNCTION public.staff_rotate_onboarding_token(uuid)
  SET search_path = public, extensions;

ALTER FUNCTION public.claim_docusign_dispatch_lease(uuid, text, text, integer, text)
  SET search_path = public, extensions;