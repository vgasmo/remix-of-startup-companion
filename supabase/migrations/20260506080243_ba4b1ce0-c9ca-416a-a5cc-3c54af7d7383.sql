
-- ============================================================================
-- SECURITY HARDENING MIGRATION
-- ============================================================================

-- 1) Restrict public-read policies to authenticated users
DO $$ BEGIN
  -- stages
  EXECUTE 'DROP POLICY IF EXISTS "Everyone can view stages" ON public.stages';
  EXECUTE 'CREATE POLICY "Authenticated can view stages" ON public.stages FOR SELECT TO authenticated USING (true)';

  -- feature_flags global
  EXECUTE 'DROP POLICY IF EXISTS "Founders can read global flags" ON public.feature_flags';
  EXECUTE 'CREATE POLICY "Authenticated can read global flags" ON public.feature_flags FOR SELECT TO authenticated USING (scope = ''global''::text)';

  -- playbook_items
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can view playbook items of active playbooks" ON public.playbook_items';
  EXECUTE 'CREATE POLICY "Authenticated can view playbook items of active playbooks" ON public.playbook_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.playbooks p WHERE p.id = playbook_items.playbook_id AND (p.is_active = true OR public.is_admin())))';

  -- playbooks
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can view active playbooks" ON public.playbooks';
  EXECUTE 'CREATE POLICY "Authenticated can view active playbooks" ON public.playbooks FOR SELECT TO authenticated USING ((is_active = true) OR public.is_admin() OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ''consultor''::app_role))';

  -- health_model_templates
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can view health model templates" ON public.health_model_templates';
  EXECUTE 'CREATE POLICY "Authenticated can view health model templates" ON public.health_model_templates FOR SELECT TO authenticated USING (true)';

  -- investor_readiness_items
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can view active readiness items" ON public.investor_readiness_items';
  EXECUTE 'CREATE POLICY "Authenticated can view active readiness items" ON public.investor_readiness_items FOR SELECT TO authenticated USING ((is_active = true) OR public.is_admin())';

  -- investor_update_templates
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can view active investor templates" ON public.investor_update_templates';
  EXECUTE 'CREATE POLICY "Authenticated can view active investor templates" ON public.investor_update_templates FOR SELECT TO authenticated USING ((is_active = true) OR public.is_admin())';

  -- tags
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can view tags" ON public.tags';
  EXECUTE 'CREATE POLICY "Authenticated can view tags" ON public.tags FOR SELECT TO authenticated USING (true)';
END $$;

-- 2) Restrict mentor profile exposure: drop the broad policy that returned the
--    full row (including calendar_feed_token, phone, email) to all authenticated
--    users. Mentor discovery should go through the existing profiles_safe view.
DROP POLICY IF EXISTS "Authenticated can read mentor profiles" ON public.profiles;

-- 3) Tighten storage delete on workspace-documents bucket: only writers
--    (admin/consultor/founder/mentor with workspace write) OR the file owner.
DROP POLICY IF EXISTS "Users can delete documents in their workspaces" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can delete documents" ON storage.objects;
CREATE POLICY "Writers or owners can delete workspace documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'workspace-documents'
  AND (
    public.can_write_workspace(((storage.foldername(name))[1])::uuid)
    OR owner = auth.uid()
  )
);

-- 4) Token hashing: add hash columns and triggers, while keeping the existing
--    plaintext columns nullable for the transition. New tokens go through hash
--    only; lookups will use hashes server-side.
ALTER TABLE public.startup_contracts
  ADD COLUMN IF NOT EXISTS onboarding_token_hash text;
ALTER TABLE public.contract_intakes
  ADD COLUMN IF NOT EXISTS intake_token_hash text;

CREATE INDEX IF NOT EXISTS idx_startup_contracts_onboarding_token_hash
  ON public.startup_contracts (onboarding_token_hash)
  WHERE onboarding_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contract_intakes_intake_token_hash
  ON public.contract_intakes (intake_token_hash)
  WHERE intake_token_hash IS NOT NULL;

-- Auto-hash trigger: when token is written, compute hash and clear plaintext
CREATE OR REPLACE FUNCTION public.hash_onboarding_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.onboarding_token IS NOT NULL THEN
    NEW.onboarding_token_hash := public.sha256_token(NEW.onboarding_token);
    -- Drop plaintext copy from storage
    NEW.onboarding_token := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hash_intake_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.intake_token IS NOT NULL THEN
    NEW.intake_token_hash := public.sha256_token(NEW.intake_token);
    NEW.intake_token := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hash_onboarding_token ON public.startup_contracts;
CREATE TRIGGER trg_hash_onboarding_token
  BEFORE INSERT OR UPDATE OF onboarding_token ON public.startup_contracts
  FOR EACH ROW EXECUTE FUNCTION public.hash_onboarding_token();

DROP TRIGGER IF EXISTS trg_hash_intake_token ON public.contract_intakes;
CREATE TRIGGER trg_hash_intake_token
  BEFORE INSERT OR UPDATE OF intake_token ON public.contract_intakes
  FOR EACH ROW EXECUTE FUNCTION public.hash_intake_token();

-- Backfill existing plaintext tokens into hashes (idempotent)
UPDATE public.startup_contracts
SET onboarding_token_hash = public.sha256_token(onboarding_token),
    onboarding_token = NULL
WHERE onboarding_token IS NOT NULL AND onboarding_token_hash IS NULL;

UPDATE public.contract_intakes
SET intake_token_hash = public.sha256_token(intake_token),
    intake_token = NULL
WHERE intake_token IS NOT NULL AND intake_token_hash IS NULL;

-- Strip token_used from any historical signature_proof_json
UPDATE public.startup_contracts
SET signature_proof_json = (signature_proof_json - 'token_used')
WHERE signature_proof_json ? 'token_used';
