
-- === Phase A: relax CHECK constraints so the existing reconciler protocol writes succeed ===

ALTER TABLE public.bulk_import_batches
  DROP CONSTRAINT IF EXISTS bulk_import_batches_status_check;
ALTER TABLE public.bulk_import_batches
  ADD CONSTRAINT bulk_import_batches_status_check
  CHECK (status = ANY (ARRAY[
    'uploading','extracting','review','committing','completed','failed',
    'staged','approved','applying','partially_failed','rejected','rolled_back'
  ]));

ALTER TABLE public.bulk_import_batches
  DROP CONSTRAINT IF EXISTS bulk_import_batches_mapping_mode_check;
ALTER TABLE public.bulk_import_batches
  ADD CONSTRAINT bulk_import_batches_mapping_mode_check
  CHECK (mapping_mode = ANY (ARRAY['per_batch','per_service','reconciler']));

ALTER TABLE public.bulk_import_rows
  DROP CONSTRAINT IF EXISTS bulk_import_rows_status_check;
ALTER TABLE public.bulk_import_rows
  ADD CONSTRAINT bulk_import_rows_status_check
  CHECK (status = ANY (ARRAY[
    'pending','extracting','extracted','will_create','will_update',
    'committed','skipped','error',
    'ready','dry_run_ok','conflict','applying','partially_failed','rolled_back'
  ]));

-- === Phase D: seed server-side safety controls in system_settings ===
-- system_settings already has admin-only RLS; we just seed the keys.

INSERT INTO public.system_settings (key, value)
VALUES
  ('data_import_v2.enabled',        jsonb_build_object('enabled', false)),
  ('reconciler.dry_run_enabled',    jsonb_build_object('enabled', true)),
  ('reconciler.writes_enabled',     jsonb_build_object('enabled', false)),
  ('reconciler.canary_max_rows',    jsonb_build_object('value', 1)),
  ('reconciler.batch_allowlist',    jsonb_build_object('batch_ids', '[]'::jsonb)),
  ('reconciler.emergency_stop',     jsonb_build_object('enabled', false))
ON CONFLICT (key) DO NOTHING;

-- === Feature-flag reader used by edge functions (server-side authoritative) ===
CREATE OR REPLACE FUNCTION public.get_feature_control(_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(value, '{}'::jsonb) FROM public.system_settings WHERE key = _key;
$$;

REVOKE ALL ON FUNCTION public.get_feature_control(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feature_control(text) TO authenticated, service_role;
