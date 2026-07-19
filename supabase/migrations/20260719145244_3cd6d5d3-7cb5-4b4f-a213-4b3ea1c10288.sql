
-- B2: drop the broken trigger that referenced a non-existent 'invited_by' column
DROP TRIGGER IF EXISTS trg_workspace_invitations_lock_self_accept ON public.workspace_invitations;
DROP FUNCTION IF EXISTS public.workspace_invitations_lock_columns_on_self_accept();

-- B3a: unique index required for ON CONFLICT(dedupe_key) in check_automation_health / email_sync_health
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_alerts_dedupe
  ON public.system_alerts (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- B4: founder_staff_requests policies with correct has_workspace_access arg order
DROP POLICY IF EXISTS "Members can create requests" ON public.founder_staff_requests;
CREATE POLICY "Members can create requests"
  ON public.founder_staff_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND public.has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "View own requests or as staff" ON public.founder_staff_requests;
CREATE POLICY "View own requests or as staff"
  ON public.founder_staff_requests FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_workspace_access(workspace_id)
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'consultor')
    OR public.has_role(auth.uid(),'backoffice')
  );

-- B5: milestones.archived_at needed by staff_transfer_workspace_program commit path
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- B3c: seed remaining automation health expectations (14 total)
INSERT INTO public.automation_health_expectations (job_name, expected_cadence_seconds, grace_seconds, severity, owner)
VALUES
  ('archive-contracts-to-sharepoint', 86400, 3600, 'warning', 'ops'),
  ('run-intake-reminders', 86400, 3600, 'warning', 'ops'),
  ('run-ecosystem-snapshot', 86400, 3600, 'warning', 'ops'),
  ('generate-crm-notifications', 3600, 600, 'warning', 'ops'),
  ('send-milestone-reminders', 86400, 3600, 'warning', 'ops'),
  ('run-checkin-reminders', 86400, 3600, 'warning', 'ops'),
  ('check-missed-milestones', 86400, 3600, 'warning', 'ops'),
  ('check-mentor-nda-expiry', 86400, 3600, 'warning', 'ops'),
  ('check-contract-anniversaries', 86400, 3600, 'warning', 'ops'),
  ('compute-cohort-benchmarks', 604800, 86400, 'warning', 'ops'),
  ('send-email-digest', 86400, 3600, 'warning', 'ops'),
  ('send-weekly-health-digest', 604800, 86400, 'warning', 'ops'),
  ('recompute-health-scores', 3600, 600, 'warning', 'ops')
ON CONFLICT (job_name) DO NOTHING;

-- B6: fail-closed containment of transcripts whose original tier was lost in the
-- 2026-07-18 mass flip (staff_only -> workspace). Anything not clearly workspace-
-- provenance (consultor/check-in/follow-up/import-teams-transcript/meeting_ingest)
-- gets re-contained to staff_only + flagged for staff review.
UPDATE public.session_transcripts st
SET confidentiality = 'staff_only',
    pending_confidentiality_review = true
WHERE confidentiality = 'workspace'
  AND pending_confidentiality_review IS NOT TRUE
  AND (
    source NOT IN ('meeting_ingest','zoom','google_meet','teams','voice','import-teams-transcript')
    AND source IS DISTINCT FROM 'manual'
  );

-- B8: backoffice SELECT on workspaces / startups / profiles (UI already promises it,
-- and contracts/rooms/pricing policies already include backoffice)
DROP POLICY IF EXISTS "Backoffice can view workspaces" ON public.workspaces;
CREATE POLICY "Backoffice can view workspaces"
  ON public.workspaces FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'backoffice'));

DROP POLICY IF EXISTS "Backoffice can view startups" ON public.startups;
CREATE POLICY "Backoffice can view startups"
  ON public.startups FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'backoffice'));

DROP POLICY IF EXISTS "Backoffice can view profiles" ON public.profiles;
CREATE POLICY "Backoffice can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'backoffice'));

-- B10: restore peer profile visibility (regressed by profiles_safe security_invoker flip)
DROP POLICY IF EXISTS "Members can view peer profiles" ON public.profiles;
CREATE POLICY "Members can view peer profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.workspace_users a
      JOIN public.workspace_users b ON a.workspace_id = b.workspace_id
      WHERE a.user_id = auth.uid() AND a.active AND b.user_id = profiles.id
    )
  );

-- B9: RPC so founder wizard can flip needs_onboarding without an UPDATE policy on workspaces
CREATE OR REPLACE FUNCTION public.complete_workspace_onboarding(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_users wu
    WHERE wu.workspace_id = p_workspace_id
      AND wu.user_id = auth.uid()
      AND wu.active = true
  ) AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.workspaces
     SET needs_onboarding = false, updated_at = now()
   WHERE id = p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_workspace_onboarding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_workspace_onboarding(uuid) TO authenticated;
