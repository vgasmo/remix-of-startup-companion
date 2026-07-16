
ALTER TABLE public.bulk_import_batches
  ADD COLUMN IF NOT EXISTS plan_hash_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

ALTER TABLE public.bulk_import_rows
  ADD COLUMN IF NOT EXISTS classification text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bulk_import_rows_classification_check'
  ) THEN
    ALTER TABLE public.bulk_import_rows
      ADD CONSTRAINT bulk_import_rows_classification_check
      CHECK (classification IS NULL OR classification IN ('valid','warning','conflict','duplicate','rejected'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_import_batches_lock_plan_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.plan_hash IS NULL THEN
      RAISE EXCEPTION 'bulk_import_batches: cannot approve without plan_hash';
    END IF;
    NEW.plan_hash_locked_at := COALESCE(NEW.plan_hash_locked_at, now());
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
  END IF;

  IF OLD.status IN ('approved','applying','completed')
     AND NEW.plan_hash IS DISTINCT FROM OLD.plan_hash THEN
    RAISE EXCEPTION 'bulk_import_batches: plan_hash is locked once approved';
  END IF;

  IF OLD.status = 'approved' AND NEW.status IN ('staged','reviewed') THEN
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.plan_hash_locked_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bulk_import_batches_lock_plan_hash ON public.bulk_import_batches;
CREATE TRIGGER trg_bulk_import_batches_lock_plan_hash
BEFORE UPDATE ON public.bulk_import_batches
FOR EACH ROW EXECUTE FUNCTION public.bulk_import_batches_lock_plan_hash();

CREATE OR REPLACE FUNCTION public.bulk_import_approve(_batch_id uuid, _plan_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _batch public.bulk_import_batches%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (public.has_role(_caller, 'admin'::app_role) OR public.has_role(_caller, 'backoffice'::app_role)) THEN
    RAISE EXCEPTION 'forbidden: admin or backoffice role required';
  END IF;

  SELECT * INTO _batch FROM public.bulk_import_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch not found';
  END IF;

  IF _batch.plan_hash IS NULL OR _batch.plan_hash <> _plan_hash THEN
    RAISE EXCEPTION 'plan_hash mismatch: refusing to approve';
  END IF;

  IF _batch.status NOT IN ('staged','reviewed') THEN
    RAISE EXCEPTION 'batch is not in a reviewable state (status=%)', _batch.status;
  END IF;

  UPDATE public.bulk_import_batches
     SET status = 'approved',
         approved_by = _caller,
         approved_at = now(),
         plan_hash_locked_at = now(),
         idempotency_key = COALESCE(idempotency_key, gen_random_uuid()),
         updated_at = now()
   WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'batch_id', _batch_id,
    'status', 'approved',
    'approved_by', _caller,
    'approved_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_approve(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_import_approve(uuid, text) TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='bulk_imports_staff_read') THEN
    CREATE POLICY "bulk_imports_staff_read" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'bulk-imports' AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'backoffice'::app_role)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='bulk_imports_staff_write') THEN
    CREATE POLICY "bulk_imports_staff_write" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'bulk-imports' AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'backoffice'::app_role)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='bulk_imports_staff_update') THEN
    CREATE POLICY "bulk_imports_staff_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'bulk-imports' AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'backoffice'::app_role)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='bulk_imports_staff_delete') THEN
    CREATE POLICY "bulk_imports_staff_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'bulk-imports' AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'backoffice'::app_role)));
  END IF;
END $$;
