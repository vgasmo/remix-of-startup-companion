
-- 1. Additive columns
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS engagement_state text,
  ADD COLUMN IF NOT EXISTS service_classification text;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_engagement_state_chk
    CHECK (engagement_state IS NULL OR engagement_state IN ('prospect','active','paused','churned','service_only'));
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_service_classification_chk
    CHECK (service_classification IS NULL OR service_classification IN ('founder_journey','domiciliacao','mixed'));

ALTER TABLE public.startups
  ADD COLUMN IF NOT EXISTS phc_customer_id text,
  ADD COLUMN IF NOT EXISTS nif_normalized text;

CREATE UNIQUE INDEX IF NOT EXISTS startups_phc_customer_id_key
  ON public.startups(phc_customer_id) WHERE phc_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS startups_nif_normalized_idx
  ON public.startups(nif_normalized) WHERE nif_normalized IS NOT NULL;

-- 2. Atomic reconciler RPC
CREATE OR REPLACE FUNCTION public.reconcile_active_customer(
  p_row jsonb,
  p_idempotency_key text,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_phc text := nullif(p_row->>'phc_customer_id','');
  v_nif text := nullif(p_row->>'nif_normalized','');
  v_hs  text := nullif(p_row->>'hubspot_company_id','');
  v_email text := lower(trim(coalesce(p_row->>'contact_email','')));
  v_name text := nullif(p_row->>'organization_name','');
  v_program_id uuid := nullif(p_row->>'program_id','')::uuid;
  v_service_class text := nullif(p_row->>'service_classification','');
  v_funnel_id uuid := nullif(p_row->>'funnel_item_id','')::uuid;
  v_startup_id uuid;
  v_workspace_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_created_startup boolean := false;
  v_created_workspace boolean := false;
  v_action text;
BEGIN
  -- Auth: admin or service_role only
  IF v_actor IS NULL THEN
    -- service_role calls with no jwt: allow (edge function uses service key)
    NULL;
  ELSE
    SELECT public.has_role(v_actor, 'admin'::app_role) INTO v_is_admin;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_service_class IS NULL OR v_service_class NOT IN ('founder_journey','domiciliacao','mixed') THEN
    RAISE EXCEPTION 'service_classification required (founder_journey|domiciliacao|mixed)';
  END IF;

  -- Idempotency: if a bulk_import_rows carries this key already committed, no-op
  IF EXISTS (
    SELECT 1 FROM public.bulk_import_rows
    WHERE commit_idempotency_key = p_idempotency_key AND committed_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('action','noop','reason','idempotent_replay','idempotency_key',p_idempotency_key);
  END IF;

  -- Identity ladder for startup
  IF v_phc IS NOT NULL THEN
    SELECT id INTO v_startup_id FROM public.startups WHERE phc_customer_id = v_phc LIMIT 1;
  END IF;
  IF v_startup_id IS NULL AND v_nif IS NOT NULL THEN
    SELECT id INTO v_startup_id FROM public.startups WHERE nif_normalized = v_nif LIMIT 1;
  END IF;
  IF v_startup_id IS NULL AND v_email <> '' THEN
    SELECT id INTO v_startup_id FROM public.startups WHERE lower(trim(main_contact_email)) = v_email LIMIT 1;
  END IF;

  -- Capture before snapshot
  v_before := jsonb_build_object(
    'existing_startup_id', v_startup_id,
    'existing_workspace_ids', COALESCE(
      (SELECT jsonb_agg(id) FROM public.workspaces WHERE startup_id = v_startup_id), '[]'::jsonb
    )
  );

  IF p_dry_run THEN
    -- Determine planned action without writing
    IF v_startup_id IS NULL THEN
      v_action := 'create_startup_and_workspace';
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.workspaces
         WHERE startup_id = v_startup_id
           AND (v_program_id IS NULL OR program_id = v_program_id)
           AND archived_at IS NULL
      ) THEN
        v_action := 'link_only';
      ELSE
        v_action := 'create_workspace';
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'action', v_action,
      'dry_run', true,
      'startup_id', v_startup_id,
      'before', v_before,
      'idempotency_key', p_idempotency_key,
      'service_classification', v_service_class,
      'program_id', v_program_id
    );
  END IF;

  -- WRITE PATH — single implicit transaction (function body)
  IF v_startup_id IS NULL THEN
    INSERT INTO public.startups (name, phc_customer_id, nif_normalized, nif, main_contact_email, main_contact_name)
      VALUES (
        COALESCE(v_name, 'Startup ' || COALESCE(v_phc, v_nif, v_email)),
        v_phc, v_nif, v_nif,
        NULLIF(v_email,''),
        NULLIF(p_row->>'contact_name','')
      )
      RETURNING id INTO v_startup_id;
    v_created_startup := true;
  ELSE
    -- Fill-only-empty preservation
    UPDATE public.startups s SET
      phc_customer_id = COALESCE(s.phc_customer_id, v_phc),
      nif_normalized  = COALESCE(s.nif_normalized, v_nif),
      nif             = COALESCE(NULLIF(s.nif,''), v_nif),
      main_contact_email = COALESCE(NULLIF(s.main_contact_email,''), NULLIF(v_email,'')),
      main_contact_name  = COALESCE(NULLIF(s.main_contact_name,''), NULLIF(p_row->>'contact_name',''))
    WHERE s.id = v_startup_id;
  END IF;

  -- Find matching workspace (program-aware, not archived)
  SELECT id INTO v_workspace_id
    FROM public.workspaces
   WHERE startup_id = v_startup_id
     AND (v_program_id IS NULL OR program_id = v_program_id)
     AND archived_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_workspace_id IS NULL THEN
    INSERT INTO public.workspaces (
      startup_id, program_id, status, needs_onboarding,
      engagement_state, service_classification
    ) VALUES (
      v_startup_id, v_program_id, 'imported_unclaimed', false,
      CASE WHEN v_service_class = 'service_only' THEN 'service_only'
           WHEN v_service_class = 'domiciliacao' THEN 'service_only'
           ELSE 'active' END,
      v_service_class
    ) RETURNING id INTO v_workspace_id;
    v_created_workspace := true;
  ELSE
    UPDATE public.workspaces w SET
      engagement_state = COALESCE(w.engagement_state,
        CASE WHEN v_service_class IN ('service_only','domiciliacao') THEN 'service_only' ELSE 'active' END),
      service_classification = COALESCE(w.service_classification, v_service_class)
    WHERE w.id = v_workspace_id;
  END IF;

  -- Link funnel item (if provided) — fill-only-empty
  IF v_funnel_id IS NOT NULL THEN
    UPDATE public.funnel_items f SET
      linked_startup_id = COALESCE(f.linked_startup_id, v_startup_id),
      linked_workspace_id = COALESCE(f.linked_workspace_id, v_workspace_id),
      phc_customer_id = COALESCE(f.phc_customer_id, v_phc),
      nif_normalized  = COALESCE(f.nif_normalized, v_nif),
      hubspot_company_id = COALESCE(f.hubspot_company_id, v_hs)
    WHERE f.id = v_funnel_id;
  END IF;

  v_after := jsonb_build_object(
    'startup_id', v_startup_id,
    'workspace_id', v_workspace_id,
    'created_startup', v_created_startup,
    'created_workspace', v_created_workspace
  );

  RETURN jsonb_build_object(
    'action', CASE WHEN v_created_workspace THEN 'created' ELSE 'linked' END,
    'dry_run', false,
    'startup_id', v_startup_id,
    'workspace_id', v_workspace_id,
    'created_startup', v_created_startup,
    'created_workspace', v_created_workspace,
    'before', v_before,
    'after', v_after,
    'idempotency_key', p_idempotency_key
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_active_customer(jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_active_customer(jsonb, text, boolean) TO authenticated, service_role;
