CREATE OR REPLACE FUNCTION public.normalize_ident(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _v IS NULL OR btrim(_v) = '' THEN NULL
    ELSE lower(regexp_replace(translate(btrim(_v),
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'),
      '\s+', '', 'g'))
  END;
$$;

ALTER TABLE public.funnel_items
  ADD COLUMN IF NOT EXISTS email_normalized text
    GENERATED ALWAYS AS (public.normalize_ident(contact_email)) STORED,
  ADD COLUMN IF NOT EXISTS company_normalized text
    GENERATED ALWAYS AS (public.normalize_ident(organization_name)) STORED;

CREATE INDEX IF NOT EXISTS idx_funnel_items_email_norm_active
  ON public.funnel_items (email_normalized)
  WHERE email_normalized IS NOT NULL AND stage <> 'archived';

CREATE INDEX IF NOT EXISTS idx_funnel_items_company_norm_active
  ON public.funnel_items (company_normalized)
  WHERE company_normalized IS NOT NULL AND stage <> 'archived';

CREATE TABLE IF NOT EXISTS public.crm_import_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.crm_lead_import_batches(id) ON DELETE RESTRICT,
  row_id uuid REFERENCES public.crm_lead_import_rows(id) ON DELETE RESTRICT,
  match_kind text NOT NULL CHECK (match_kind IN ('nif','email','company_fuzzy')),
  incoming_json jsonb NOT NULL,
  existing_funnel_item_id uuid REFERENCES public.funnel_items(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','merged','ignored','created_new')),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.crm_import_conflicts TO authenticated;
GRANT ALL ON public.crm_import_conflicts TO service_role;
ALTER TABLE public.crm_import_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_import_conflicts_staff_read ON public.crm_import_conflicts;
CREATE POLICY crm_import_conflicts_staff_read ON public.crm_import_conflicts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));

DROP POLICY IF EXISTS crm_import_conflicts_staff_write ON public.crm_import_conflicts;
CREATE POLICY crm_import_conflicts_staff_write ON public.crm_import_conflicts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));

CREATE INDEX IF NOT EXISTS idx_crm_import_conflicts_batch_status
  ON public.crm_import_conflicts (batch_id, status);

DO $$ BEGIN
  ALTER TABLE public.crm_lead_import_batches
    ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'draft'
      CHECK (lifecycle_state IN ('draft','committing','committed','partial_needs_review','failed'));
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.finalize_crm_import_batch(p_batch_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pending int; v_failed int; v_new_state text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice')) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) FILTER (WHERE status = 'pending'), count(*) FILTER (WHERE status = 'failed')
    INTO v_pending, v_failed FROM public.crm_lead_import_rows WHERE batch_id = p_batch_id;
  v_new_state := CASE
    WHEN v_failed = 0 AND v_pending = 0 THEN 'committed'
    WHEN v_pending > 0 THEN 'partial_needs_review'
    ELSE 'partial_needs_review' END;
  UPDATE public.crm_lead_import_batches SET lifecycle_state = v_new_state, updated_at = now() WHERE id = p_batch_id;
  RETURN v_new_state;
END; $$;

REVOKE ALL ON FUNCTION public.finalize_crm_import_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_crm_import_batch(uuid) TO authenticated;