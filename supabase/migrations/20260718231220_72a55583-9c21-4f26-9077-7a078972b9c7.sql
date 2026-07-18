-- =============================================================================
-- RC5: Transcript confidentiality — fail-closed containment
-- Forward-only, idempotent, content-free audit.
-- =============================================================================

-- 1. Schema additions (idempotent)
ALTER TABLE public.session_transcripts
  ADD COLUMN IF NOT EXISTS pending_confidentiality_review boolean NOT NULL DEFAULT false;

ALTER TABLE public.session_transcripts
  ADD COLUMN IF NOT EXISTS contained_at timestamptz;

-- 2. Enforce allowed tiers so future writes can't drift
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_transcripts_confidentiality_chk'
  ) THEN
    ALTER TABLE public.session_transcripts
      ADD CONSTRAINT session_transcripts_confidentiality_chk
      CHECK (confidentiality IN ('staff_only', 'workspace', 'founder_only'));
  END IF;
END $$;

-- 3. Content-free audit table
CREATE TABLE IF NOT EXISTS public.transcript_containment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES public.session_transcripts(id) ON DELETE CASCADE,
  previous_confidentiality text NOT NULL,
  new_confidentiality text NOT NULL,
  reason text NOT NULL,
  contained_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transcript_id, reason)
);

GRANT SELECT ON public.transcript_containment_audit TO authenticated;
GRANT ALL ON public.transcript_containment_audit TO service_role;

ALTER TABLE public.transcript_containment_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transcript_containment_audit_staff_read ON public.transcript_containment_audit;
CREATE POLICY transcript_containment_audit_staff_read
  ON public.transcript_containment_audit
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- 4. Idempotent containment of the two known ambiguous rows.
--    We only touch rows that currently sit at 'workspace' AND have not yet
--    been flagged for review — so re-running the migration is a no-op, and a
--    subsequent human reclassification cannot be silently reverted by us.
WITH targets AS (
  SELECT id, confidentiality
    FROM public.session_transcripts
   WHERE id IN (
     'aac46abd-6028-4944-bb29-86cc07999b93'::uuid,
     '567a75f0-2837-4c59-badb-ae7fed827f74'::uuid
   )
     AND confidentiality = 'workspace'
     AND pending_confidentiality_review = false
     AND contained_at IS NULL
),
audited AS (
  INSERT INTO public.transcript_containment_audit
    (transcript_id, previous_confidentiality, new_confidentiality, reason)
  SELECT id, confidentiality, 'staff_only',
         'rc5_forward_containment_no_backup_provenance'
    FROM targets
  ON CONFLICT (transcript_id, reason) DO NOTHING
  RETURNING transcript_id
)
UPDATE public.session_transcripts st
   SET confidentiality = 'staff_only',
       pending_confidentiality_review = true,
       contained_at = now()
  FROM audited a
 WHERE st.id = a.transcript_id;

-- 5. Comment the flag so operators know its meaning without opening docs
COMMENT ON COLUMN public.session_transcripts.pending_confidentiality_review IS
  'RC5: original confidentiality tier could not be reconstructed from backup. '
  'Row is temporarily contained at staff_only. Staff must reclassify explicitly.';
COMMENT ON COLUMN public.session_transcripts.contained_at IS
  'RC5: when fail-closed containment was applied. NULL for rows that were '
  'never contained.';