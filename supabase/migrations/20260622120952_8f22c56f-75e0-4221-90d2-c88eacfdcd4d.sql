
-- =====================================================================
-- Phase 0A: Buildings SELECT — restore read access for all auth users
-- =====================================================================
DROP POLICY IF EXISTS "Staff can view buildings" ON public.buildings;
DROP POLICY IF EXISTS "buildings_select" ON public.buildings;

CREATE POLICY "buildings_select_authenticated"
  ON public.buildings
  FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================================
-- Phase 0B: Documents RESTRICTIVE policy — fix wrong enum literal
-- =====================================================================
DROP POLICY IF EXISTS "Block non-staff writes on staff_only documents" ON public.documents;
DROP POLICY IF EXISTS "documents_no_staff_only_for_founders" ON public.documents;

CREATE POLICY "documents_no_private_staff_for_non_staff"
  ON public.documents
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    visibility <> 'private_staff'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'consultor'::public.app_role)
    OR public.has_role(auth.uid(), 'backoffice'::public.app_role)
  );

-- =====================================================================
-- Phase 0C: storage.objects — fix same wrong literal for workspace docs
-- =====================================================================
DROP POLICY IF EXISTS "Workspace members can view documents" ON storage.objects;

CREATE POLICY "Workspace members can view documents"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'workspace-documents'
    AND public.has_workspace_access(((storage.foldername(name))[1])::uuid)
    AND (
      public.is_staff()
      OR NOT EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.file_path = storage.objects.name
          AND d.visibility = 'private_staff'
      )
    )
  );

-- =====================================================================
-- Phase 1: profiles.preferred_language
-- =====================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'pt';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_preferred_language_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_preferred_language_check
      CHECK (preferred_language IN ('pt', 'en'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.preferred_language IS
  'User language preference for emails and generated documents. Default pt (Portuguese).';
