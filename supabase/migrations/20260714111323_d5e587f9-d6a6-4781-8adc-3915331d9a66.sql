
-- Structured external identifiers on funnel_items (CRM records).
ALTER TABLE public.funnel_items
  ADD COLUMN IF NOT EXISTS phc_customer_id      text,
  ADD COLUMN IF NOT EXISTS hubspot_company_id   text,
  ADD COLUMN IF NOT EXISTS hubspot_deal_id      text,
  ADD COLUMN IF NOT EXISTS nif_normalized       text,
  ADD COLUMN IF NOT EXISTS source_system        text,
  ADD COLUMN IF NOT EXISTS source_updated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS verified_fields_json jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill from metadata_json (best-effort, non-destructive; only when target column is null).
UPDATE public.funnel_items
   SET hubspot_deal_id    = COALESCE(hubspot_deal_id,    NULLIF(metadata_json->>'hubspot_deal_id', '')),
       hubspot_company_id = COALESCE(hubspot_company_id, NULLIF(metadata_json->>'hubspot_company_id', '')),
       nif_normalized     = COALESCE(nif_normalized,     NULLIF(regexp_replace(metadata_json->>'nif', '\D', '', 'g'), ''))
 WHERE (metadata_json ? 'hubspot_deal_id'
     OR metadata_json ? 'hubspot_company_id'
     OR metadata_json ? 'nif');

-- Deduplicate before applying partial unique indexes: if backfill produced duplicates,
-- keep the most recently updated row and clear the identifier on the losers so the
-- index can be created. Losers are logged into commit_result via metadata.
WITH dupes AS (
  SELECT id, hubspot_deal_id,
         row_number() OVER (PARTITION BY hubspot_deal_id ORDER BY updated_at DESC NULLS LAST, id) rn
    FROM public.funnel_items
   WHERE hubspot_deal_id IS NOT NULL
)
UPDATE public.funnel_items f SET hubspot_deal_id = NULL, metadata_json = metadata_json || jsonb_build_object('backfill_dedup_hubspot_deal_id', dupes.hubspot_deal_id)
  FROM dupes WHERE f.id = dupes.id AND dupes.rn > 1;

WITH dupes AS (
  SELECT id, phc_customer_id,
         row_number() OVER (PARTITION BY phc_customer_id ORDER BY updated_at DESC NULLS LAST, id) rn
    FROM public.funnel_items
   WHERE phc_customer_id IS NOT NULL
)
UPDATE public.funnel_items f SET phc_customer_id = NULL
  FROM dupes WHERE f.id = dupes.id AND dupes.rn > 1;

WITH dupes AS (
  SELECT id, hubspot_company_id,
         row_number() OVER (PARTITION BY hubspot_company_id ORDER BY updated_at DESC NULLS LAST, id) rn
    FROM public.funnel_items
   WHERE hubspot_company_id IS NOT NULL
)
UPDATE public.funnel_items f SET hubspot_company_id = NULL
  FROM dupes WHERE f.id = dupes.id AND dupes.rn > 1;

WITH dupes AS (
  SELECT id, nif_normalized,
         row_number() OVER (PARTITION BY nif_normalized ORDER BY updated_at DESC NULLS LAST, id) rn
    FROM public.funnel_items
   WHERE nif_normalized IS NOT NULL
)
UPDATE public.funnel_items f SET nif_normalized = NULL
  FROM dupes WHERE f.id = dupes.id AND dupes.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_items_phc_customer_id
  ON public.funnel_items (phc_customer_id) WHERE phc_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_items_hubspot_deal_id
  ON public.funnel_items (hubspot_deal_id) WHERE hubspot_deal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_items_hubspot_company_id
  ON public.funnel_items (hubspot_company_id) WHERE hubspot_company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_items_nif_normalized
  ON public.funnel_items (nif_normalized) WHERE nif_normalized IS NOT NULL;

-- Source-agnostic commit RPC. Never overwrites non-empty verified fields. Upserts
-- external_entity_refs in the same transaction. Raises P0003 on stale match.
CREATE OR REPLACE FUNCTION public.commit_import_funnel_item_v2(
  p_job_id uuid,
  p_row_id uuid,
  p_match_entity_id uuid,
  p_expected_updated_at timestamptz,
  p_source text,
  p_payload jsonb,
  p_external_ids jsonb,      -- {"phc/customer":"1234", "hubspot/deal":"999"}
  p_verified_fields jsonb,   -- {"contact_email": true}
  p_final_stage text,
  p_tags text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_target_id uuid;
  v_before jsonb;
  v_after  jsonb;
  v_row public.funnel_items%ROWTYPE;
  v_key text;
  v_val text;
  v_provider text;
  v_object_type text;
BEGIN
  IF p_match_entity_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.funnel_items WHERE id = p_match_entity_id FOR UPDATE;
    IF NOT FOUND THEN
      v_action := 'insert'; v_target_id := NULL;
    ELSE
      IF p_expected_updated_at IS NOT NULL AND v_row.updated_at <> p_expected_updated_at THEN
        RAISE EXCEPTION 'stale_match' USING ERRCODE = 'P0003';
      END IF;
      v_action := 'update'; v_target_id := v_row.id;
    END IF;
  ELSE
    v_action := 'insert';
  END IF;

  IF v_action = 'insert' THEN
    INSERT INTO public.funnel_items (
      organization_name, contact_name, contact_email, contact_phone,
      program_id, type, stage, tags, metadata_json,
      phc_customer_id, hubspot_company_id, hubspot_deal_id, nif_normalized,
      source_system, source_updated_at
    ) VALUES (
      p_payload->>'organization_name',
      p_payload->>'contact_name',
      p_payload->>'contact_email',
      p_payload->>'contact_phone',
      NULLIF(p_payload->>'program_id','')::uuid,
      COALESCE(p_payload->>'type','startup'),
      p_final_stage,
      p_tags,
      COALESCE(p_payload->'metadata_json','{}'::jsonb),
      NULLIF(p_payload->>'phc_customer_id',''),
      NULLIF(p_payload->>'hubspot_company_id',''),
      NULLIF(p_payload->>'hubspot_deal_id',''),
      NULLIF(p_payload->>'nif_normalized',''),
      p_source,
      COALESCE((p_payload->>'source_updated_at')::timestamptz, now())
    ) RETURNING id INTO v_target_id;
    v_before := NULL;
  ELSE
    v_before := to_jsonb(v_row);
    -- COALESCE with existing values: never overwrite a non-empty verified field with anything;
    -- never overwrite any non-empty column with a blank/null from source.
    UPDATE public.funnel_items SET
      organization_name = CASE
        WHEN (p_verified_fields ? 'organization_name') AND organization_name IS NOT NULL AND organization_name <> '' THEN organization_name
        ELSE COALESCE(NULLIF(p_payload->>'organization_name',''), organization_name) END,
      contact_name = CASE
        WHEN (p_verified_fields ? 'contact_name') AND contact_name IS NOT NULL AND contact_name <> '' THEN contact_name
        ELSE COALESCE(NULLIF(p_payload->>'contact_name',''), contact_name) END,
      contact_email = CASE
        WHEN (p_verified_fields ? 'contact_email') AND contact_email IS NOT NULL AND contact_email <> '' THEN contact_email
        ELSE COALESCE(NULLIF(p_payload->>'contact_email',''), contact_email) END,
      contact_phone = CASE
        WHEN (p_verified_fields ? 'contact_phone') AND contact_phone IS NOT NULL AND contact_phone <> '' THEN contact_phone
        ELSE COALESCE(NULLIF(p_payload->>'contact_phone',''), contact_phone) END,
      stage = COALESCE(p_final_stage, stage),
      tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}') || COALESCE(p_tags,'{}'))),
      metadata_json = metadata_json || COALESCE(p_payload->'metadata_json','{}'::jsonb),
      phc_customer_id    = COALESCE(NULLIF(p_payload->>'phc_customer_id',''),    phc_customer_id),
      hubspot_company_id = COALESCE(NULLIF(p_payload->>'hubspot_company_id',''), hubspot_company_id),
      hubspot_deal_id    = COALESCE(NULLIF(p_payload->>'hubspot_deal_id',''),    hubspot_deal_id),
      nif_normalized     = COALESCE(NULLIF(p_payload->>'nif_normalized',''),     nif_normalized),
      source_system      = CASE WHEN source_system IS NULL OR source_system = p_source THEN p_source ELSE 'mixed' END,
      source_updated_at  = GREATEST(COALESCE(source_updated_at, 'epoch'::timestamptz),
                                    COALESCE((p_payload->>'source_updated_at')::timestamptz, now())),
      updated_at = now()
    WHERE id = v_target_id;
  END IF;

  -- Upsert external_entity_refs for every provider/object_type given.
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(COALESCE(p_external_ids,'{}'::jsonb)) LOOP
    IF v_val IS NULL OR v_val = '' THEN CONTINUE; END IF;
    v_provider    := split_part(v_key, '/', 1);
    v_object_type := split_part(v_key, '/', 2);
    INSERT INTO public.external_entity_refs (provider, object_type, external_id, internal_entity_type, internal_entity_id)
    VALUES (v_provider, v_object_type, v_val, 'funnel_item', v_target_id)
    ON CONFLICT (provider, object_type, external_id)
      DO UPDATE SET internal_entity_id = EXCLUDED.internal_entity_id, updated_at = now();
  END LOOP;

  SELECT to_jsonb(f) INTO v_after FROM public.funnel_items f WHERE id = v_target_id;
  RETURN jsonb_build_object(
    'action', v_action,
    'target_id', v_target_id,
    'before', v_before,
    'after', v_after
  );
END $$;

REVOKE ALL ON FUNCTION public.commit_import_funnel_item_v2(uuid,uuid,uuid,timestamptz,text,jsonb,jsonb,jsonb,text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_import_funnel_item_v2(uuid,uuid,uuid,timestamptz,text,jsonb,jsonb,jsonb,text,text[]) TO service_role;
