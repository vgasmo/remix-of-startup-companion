
-- Additive columns on bulk_import_batches
ALTER TABLE public.bulk_import_batches
  ADD COLUMN IF NOT EXISTS mapping_mode text NOT NULL DEFAULT 'per_batch'
    CHECK (mapping_mode IN ('per_batch','per_service')),
  ADD COLUMN IF NOT EXISTS service_program_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS package_manifest jsonb,
  ADD COLUMN IF NOT EXISTS dry_run_report jsonb,
  ADD COLUMN IF NOT EXISTS package_kind text
    CHECK (package_kind IS NULL OR package_kind IN ('legacy','tomorrow'));

-- Additive columns on bulk_import_rows
ALTER TABLE public.bulk_import_rows
  ADD COLUMN IF NOT EXISTS before_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS after_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS rollback_state text NOT NULL DEFAULT 'none'
    CHECK (rollback_state IN ('none','committed','rolled_back','failed')),
  ADD COLUMN IF NOT EXISTS pdf_sha256 text,
  ADD COLUMN IF NOT EXISTS pdf_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_case text,
  ADD COLUMN IF NOT EXISTS tomorrow_queue text,
  ADD COLUMN IF NOT EXISTS service_group text,
  ADD COLUMN IF NOT EXISTS commit_authorized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commit_idempotency_key text,
  ADD COLUMN IF NOT EXISTS committed_at timestamptz,
  ADD COLUMN IF NOT EXISTS committed_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_bir_batch_queue
  ON public.bulk_import_rows(batch_id, tomorrow_queue);
CREATE INDEX IF NOT EXISTS idx_bir_pdf_sha
  ON public.bulk_import_rows(pdf_sha256);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bir_idempotency
  ON public.bulk_import_rows(batch_id, commit_idempotency_key)
  WHERE commit_idempotency_key IS NOT NULL;

-- Rollback audit table
CREATE TABLE IF NOT EXISTS public.bulk_import_rollbacks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.bulk_import_batches(id) ON DELETE CASCADE,
  row_id uuid REFERENCES public.bulk_import_rows(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id),
  reason text,
  undo_payload jsonb NOT NULL,
  storage_objects_removed jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text NOT NULL DEFAULT 'success'
    CHECK (outcome IN ('success','partial','failed')),
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_import_rollbacks TO authenticated;
GRANT ALL ON public.bulk_import_rollbacks TO service_role;

ALTER TABLE public.bulk_import_rollbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read bulk_import_rollbacks" ON public.bulk_import_rollbacks;
CREATE POLICY "Staff can read bulk_import_rollbacks"
  ON public.bulk_import_rollbacks
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'backoffice'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins can insert bulk_import_rollbacks" ON public.bulk_import_rollbacks;
CREATE POLICY "Admins can insert bulk_import_rollbacks"
  ON public.bulk_import_rollbacks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- No UPDATE / DELETE policy for authenticated: audit rows are immutable from the app.
-- service_role bypasses RLS and can perform maintenance if ever needed.

CREATE INDEX IF NOT EXISTS idx_bir_rb_batch ON public.bulk_import_rollbacks(batch_id, executed_at DESC);
