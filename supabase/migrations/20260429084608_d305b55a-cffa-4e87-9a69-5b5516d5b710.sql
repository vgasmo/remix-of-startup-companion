-- Enable pg_trgm for fuzzy/typo-tolerant search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for fuzzy search across the most user-typed entities
CREATE INDEX IF NOT EXISTS idx_startups_name_trgm ON public.startups USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_funnel_items_org_trgm ON public.funnel_items USING gin (organization_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_funnel_items_contact_trgm ON public.funnel_items USING gin (contact_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm ON public.profiles USING gin (full_name gin_trgm_ops);

-- Fuzzy startup search RPC: returns startups whose name is similar to query (handles typos)
CREATE OR REPLACE FUNCTION public.fuzzy_search_startups(p_query text, p_limit int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  updated_at timestamptz,
  similarity real
)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.description, s.updated_at,
         similarity(s.name, p_query) AS similarity
  FROM public.startups s
  WHERE s.archived_at IS NULL
    AND s.name % p_query                  -- pg_trgm operator, uses index
    AND similarity(s.name, p_query) > 0.2
  ORDER BY similarity(s.name, p_query) DESC, s.name ASC
  LIMIT p_limit;
$$;

-- Fuzzy lead search RPC
CREATE OR REPLACE FUNCTION public.fuzzy_search_leads(p_query text, p_limit int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  organization_name text,
  contact_name text,
  contact_email text,
  stage text,
  updated_at timestamptz,
  similarity real
)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT f.id, f.organization_name, f.contact_name, f.contact_email,
         f.stage::text, f.updated_at,
         GREATEST(
           similarity(COALESCE(f.organization_name, ''), p_query),
           similarity(COALESCE(f.contact_name, ''), p_query)
         ) AS similarity
  FROM public.funnel_items f
  WHERE (f.organization_name % p_query OR f.contact_name % p_query)
    AND GREATEST(
      similarity(COALESCE(f.organization_name, ''), p_query),
      similarity(COALESCE(f.contact_name, ''), p_query)
    ) > 0.2
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.fuzzy_search_startups(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fuzzy_search_leads(text, int) TO authenticated;

-- Harden approve_startup_claim: when a claim is approved, ensure workspace is ACTIVE
-- (no onboarding wizard required when staff has already validated the claim)
CREATE OR REPLACE FUNCTION public.approve_startup_claim(p_claim_id uuid, p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claim RECORD;
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can approve claims';
  END IF;

  SELECT * INTO v_claim FROM startup_claim_requests WHERE id = p_claim_id AND status = 'pending';
  IF v_claim IS NULL THEN
    RAISE EXCEPTION 'Claim not found or already resolved';
  END IF;

  INSERT INTO workspace_users (workspace_id, user_id, role, active)
  VALUES (p_workspace_id, v_claim.user_id, 'founder', true)
  ON CONFLICT DO NOTHING;

  -- Activate the workspace immediately (was: status='claimed' which left founder in onboarding limbo)
  UPDATE workspaces 
  SET status = 'active',
      needs_onboarding = false,
      updated_at = now()
  WHERE id = p_workspace_id;

  INSERT INTO user_roles (user_id, role) VALUES (v_claim.user_id, 'founder') ON CONFLICT DO NOTHING;

  -- Approve the founder account so they can write
  UPDATE profiles
  SET account_status = 'approved', updated_at = now()
  WHERE id = v_claim.user_id AND account_status != 'approved';

  UPDATE startup_claim_requests
  SET status = 'approved', workspace_id = p_workspace_id, resolved_at = now(), resolved_by = v_admin_id
  WHERE id = p_claim_id;
END;
$function$;