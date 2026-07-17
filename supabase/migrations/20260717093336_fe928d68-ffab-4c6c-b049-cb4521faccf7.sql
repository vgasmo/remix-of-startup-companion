
-- =====================================================
-- Teams Meeting Recording — auto-import + consent + confidentiality
-- =====================================================

-- ---------- sessions: consent + import tracking + online meeting cache ----------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS recording_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_consent_by uuid,
  ADD COLUMN IF NOT EXISTS online_meeting_id text,
  ADD COLUMN IF NOT EXISTS transcript_import_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcript_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS transcript_import_status text;

CREATE INDEX IF NOT EXISTS idx_sessions_transcript_sweep
  ON public.sessions (completed_at)
  WHERE recording_consent = true
    AND (outlook_event_id IS NOT NULL OR teams_meeting_url IS NOT NULL);

-- ---------- session_transcripts: confidentiality + unique for upsert ----------
ALTER TABLE public.session_transcripts
  ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'staff_only';

-- add check constraint idempotently
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_transcripts_confidentiality_chk'
  ) THEN
    ALTER TABLE public.session_transcripts
      ADD CONSTRAINT session_transcripts_confidentiality_chk
      CHECK (confidentiality IN ('staff_only','workspace'));
  END IF;
END $$;

-- unique for upsert(onConflict=session_id,source)
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_transcripts_session_source
  ON public.session_transcripts (session_id, source);

-- ---------- session_transcripts RLS: tiered read policy ----------
DROP POLICY IF EXISTS "session_transcripts_workspace_select" ON public.session_transcripts;

CREATE POLICY "session_transcripts_tiered_select"
ON public.session_transcripts
FOR SELECT TO authenticated
USING (
  public.is_staff()
  OR (
    confidentiality = 'workspace'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_transcripts.session_id
        AND public.has_workspace_access(s.workspace_id)
    )
  )
);

-- ---------- transcript deletion audit (GDPR right to erasure) ----------
CREATE TABLE IF NOT EXISTS public.transcript_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  workspace_id uuid,
  deleted_by uuid,
  reason text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.transcript_deletion_audit TO authenticated;
GRANT ALL ON public.transcript_deletion_audit TO service_role;

ALTER TABLE public.transcript_deletion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transcript_deletion_audit_staff_all"
ON public.transcript_deletion_audit
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- ---------- workspace-level recording consent (mirrors NDA pattern) ----------
CREATE TABLE IF NOT EXISTS public.workspace_recording_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  consent_version text NOT NULL DEFAULT 'PT-REC-2026-01',
  accepted_by uuid NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  UNIQUE (workspace_id, consent_version)
);

GRANT SELECT, INSERT, UPDATE ON public.workspace_recording_consents TO authenticated;
GRANT ALL ON public.workspace_recording_consents TO service_role;

ALTER TABLE public.workspace_recording_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wrc_workspace_select"
ON public.workspace_recording_consents
FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));

CREATE POLICY "wrc_workspace_insert"
ON public.workspace_recording_consents
FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_access(workspace_id) AND accepted_by = auth.uid());

CREATE POLICY "wrc_staff_manage"
ON public.workspace_recording_consents
FOR UPDATE TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- helper to check active consent
CREATE OR REPLACE FUNCTION public.has_recording_consent(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_recording_consents
    WHERE workspace_id = _workspace_id
      AND revoked_at IS NULL
  );
$$;

-- ---------- cron: sweep-session-transcripts every 20 min ----------
DO $do$ BEGIN PERFORM cron.unschedule('sweep-session-transcripts'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;

SELECT cron.schedule(
  'sweep-session-transcripts',
  '*/20 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sweep-session-transcripts',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
