
-- Ensure idempotency key is unique (partial index, ignores NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS bulk_import_rows_commit_idem_uidx
  ON public.bulk_import_rows (commit_idempotency_key)
  WHERE commit_idempotency_key IS NOT NULL;

-- Rewritten RPC: strict identity + policy
CREATE OR REPLACE FUNCTION public.reconcile_active_customer(
  p_row jsonb,
  p_idempotency_key text,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_match_count int;
  v_before jsonb;
  v_after jsonb;
  v_created_startup boolean := false;
  v_created_workspace boolean := false;
  v_prior jsonb;
  v_action text;
BEGIN
  -- Auth: admin OR service_role (auth.uid() is null for service role)
  IF v_actor IS NOT NULL THEN
    SELECT public.has_role(v_actor, 'admin'::app_role) INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Service classification must be one of the allowed values
  IF v_service_class IS NULL OR v_service_class NOT IN ('founder_journey','domiciliacao','mixed') THEN
    RAISE EXCEPTION 'service_classification_required' USING ERRCODE = 'P0001',
      DETAIL = 'must be one of: founder_journey, domiciliacao, mixed';
  END IF;

  -- Programme id required for founder_journey and mixed
  IF v_service_class IN ('founder_journey','mixed') AND v_program_id IS NULL THEN
    RAISE EXCEPTION 'programme_id_required' USING ERRCODE = 'P0001',
      DETAIL = 'founder_journey and mixed require an explicit program_id';
  END IF;

  -- Idempotency replay: if a prior commit exists with this key, return its after_snapshot
  SELECT after_snapshot INTO v_prior
    FROM public.bulk_import_rows
   WHERE commit_idempotency_key = p_idempotency_key
     AND committed_at IS NOT NULL
   LIMIT 1;
  IF v_prior IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action','already_current',
      'idempotency_key', p_idempotency_key,
      'after', v_prior
    );
  END IF;

  -- Identity ladder: PHC → NIF → HubSpot. NEVER auto-link by email (advisory only).
  -- Ambiguity (>1 match) is a hard conflict.
  IF v_phc IS NOT NULL THEN
    SELECT count(*) INTO v_match_count FROM public.startups WHERE phc_customer_id = v_phc;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'ambiguous_phc_match' USING ERRCODE = 'P0002',
        DETAIL = 'more than one startup carries the same phc_customer_id';
    END IF;
    SELECT id INTO v_startup_id FROM public.startups WHERE phc_customer_id = v_phc;
  END IF;

  IF v_startup_id IS NULL AND v_nif IS NOT NULL THEN
    SELECT count(*) INTO v_match_count FROM public.startups WHERE nif_normalized = v_nif;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'ambiguous_nif_match' USING ERRCODE = 'P0002',
        DETAIL = 'more than one startup carries the same normalized NIF';
    END IF;
    SELECT id INTO v_startup_id FROM public.startups WHERE nif_normalized = v_nif;
  END IF;

  IF v_startup_id IS NULL AND v_hs IS NOT NULL THEN
    SELECT count(*) INTO v_match_count FROM public.startups WHERE hubspot_company_id = v_hs;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'ambiguous_hubspot_match' USING ERRCODE = 'P0002',
        DETAIL = 'more than one startup carries the same hubspot_company_id';
    END IF;
    SELECT id INTO v_startup_id FROM public.startups WHERE hubspot_company_id = v_hs;
  END IF;

  -- Snapshot before-state
  v_before := jsonb_build_object(
    'existing_startup_id', v_startup_id,
    'existing_workspace_ids', COALESCE(
      (SELECT jsonb_agg(id) FROM public.workspaces WHERE startup_id = v_startup_id), '[]'::jsonb
    ),
    'program_id', v_program_id,
    'service_classification', v_service_class
  );

  IF p_dry_run THEN
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

  -- WRITE PATH — function body is one implicit transaction
  IF v_startup_id IS NULL THEN
    INSERT INTO public.startups (name, phc_customer_id, nif_normalized, nif, main_contact_email, main_contact_name, hubspot_company_id)
      VALUES (
        COALESCE(v_name, 'Startup ' || COALESCE(v_phc, v_nif, v_hs, 'unknown')),
        v_phc, v_nif, v_nif,
        NULLIF(v_email,''),
        NULLIF(p_row->>'contact_name',''),
        v_hs
      )
      RETURNING id INTO v_startup_id;
    v_created_startup := true;
  ELSE
    -- Fill-only-empty (never overwrite existing authoritative fields)
    UPDATE public.startups s SET
      phc_customer_id    = COALESCE(s.phc_customer_id, v_phc),
      nif_normalized     = COALESCE(s.nif_normalized, v_nif),
      nif                = COALESCE(NULLIF(s.nif,''), v_nif),
      hubspot_company_id = COALESCE(s.hubspot_company_id, v_hs),
      main_contact_email = COALESCE(NULLIF(s.main_contact_email,''), NULLIF(v_email,'')),
      main_contact_name  = COALESCE(NULLIF(s.main_contact_name,''), NULLIF(p_row->>'contact_name',''))
    WHERE s.id = v_startup_id;
  END IF;

  -- Program-aware, non-archived, unambiguous workspace lookup
  SELECT count(*) INTO v_match_count
    FROM public.workspaces
   WHERE startup_id = v_startup_id
     AND (v_program_id IS NULL OR program_id = v_program_id)
     AND archived_at IS NULL;
  IF v_match_count > 1 THEN
    RAISE EXCEPTION 'ambiguous_workspace_match' USING ERRCODE = 'P0002',
      DETAIL = 'more than one active workspace matches this startup+program';
  END IF;

  SELECT id INTO v_workspace_id
    FROM public.workspaces
   WHERE startup_id = v_startup_id
     AND (v_program_id IS NULL OR program_id = v_program_id)
     AND archived_at IS NULL;

  IF v_workspace_id IS NULL THEN
    INSERT INTO public.workspaces (
      startup_id, program_id, status, needs_onboarding,
      engagement_state, service_classification
    ) VALUES (
      v_startup_id, v_program_id, 'imported_unclaimed', false,
      CASE WHEN v_service_class = 'domiciliacao' THEN 'service_only' ELSE 'operational' END,
      v_service_class
    ) RETURNING id INTO v_workspace_id;
    v_created_workspace := true;
  ELSE
    UPDATE public.workspaces w SET
      engagement_state = COALESCE(w.engagement_state,
        CASE WHEN v_service_class = 'domiciliacao' THEN 'service_only' ELSE 'operational' END),
      service_classification = COALESCE(w.service_classification, v_service_class)
    WHERE w.id = v_workspace_id;
  END IF;

  -- Link funnel item (fill-only-empty) if provided
  IF v_funnel_id IS NOT NULL THEN
    UPDATE public.funnel_items f SET
      linked_startup_id  = COALESCE(f.linked_startup_id, v_startup_id),
      linked_workspace_id= COALESCE(f.linked_workspace_id, v_workspace_id),
      phc_customer_id    = COALESCE(f.phc_customer_id, v_phc),
      nif_normalized     = COALESCE(f.nif_normalized, v_nif),
      hubspot_company_id = COALESCE(f.hubspot_company_id, v_hs)
    WHERE f.id = v_funnel_id;
  END IF;

  v_after := jsonb_build_object(
    'startup_id', v_startup_id,
    'workspace_id', v_workspace_id,
    'created_startup', v_created_startup,
    'created_workspace', v_created_workspace,
    'program_id', v_program_id,
    'service_classification', v_service_class
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
END;
$function$;

-- Rollback RPC: restore from before_snapshot on a bulk_import_rows row.
-- Deletes workspace/startup only if they were created by this row and have no dependents.
CREATE OR REPLACE FUNCTION public.reconcile_rollback(p_row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.bulk_import_rows%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_ws_id uuid;
  v_startup_id uuid;
  v_created_startup boolean;
  v_created_workspace boolean;
  v_dep_count int;
BEGIN
  -- Must be admin (service role bypasses)
  IF v_actor IS NOT NULL AND NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.bulk_import_rows WHERE id = p_row_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'row_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.committed_at IS NULL THEN
    RAISE EXCEPTION 'row_not_committed' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.rollback_state = 'rolled_back' THEN
    RETURN jsonb_build_object('action','noop','reason','already_rolled_back','row_id',p_row_id);
  END IF;

  v_before := v_row.before_snapshot;
  v_after  := v_row.after_snapshot;
  v_ws_id  := nullif(v_after->>'workspace_id','')::uuid;
  v_startup_id := nullif(v_after->>'startup_id','')::uuid;
  v_created_workspace := COALESCE((v_after->>'created_workspace')::boolean, false);
  v_created_startup   := COALESCE((v_after->>'created_startup')::boolean, false);

  -- Only tear down what we created; refuse if the workspace already has dependents.
  IF v_created_workspace AND v_ws_id IS NOT NULL THEN
    SELECT
      (SELECT count(*) FROM public.workspace_users WHERE workspace_id = v_ws_id) +
      (SELECT count(*) FROM public.sessions WHERE workspace_id = v_ws_id) +
      (SELECT count(*) FROM public.startup_contracts WHERE workspace_id = v_ws_id) +
      (SELECT count(*) FROM public.milestones WHERE workspace_id = v_ws_id) +
      (SELECT count(*) FROM public.action_items WHERE workspace_id = v_ws_id)
    INTO v_dep_count;

    IF v_dep_count > 0 THEN
      RAISE EXCEPTION 'workspace_has_dependents' USING ERRCODE = 'P0001',
        DETAIL = format('workspace %s has %s dependent rows; manual reversal required', v_ws_id, v_dep_count);
    END IF;

    DELETE FROM public.workspaces WHERE id = v_ws_id;
  END IF;

  IF v_created_startup AND v_startup_id IS NOT NULL THEN
    -- Only delete if no remaining workspaces reference it
    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE startup_id = v_startup_id) THEN
      DELETE FROM public.startups WHERE id = v_startup_id;
    END IF;
  END IF;

  -- Un-link funnel item if we set those fields (safe: fill-only-empty means we can only null what matches)
  UPDATE public.bulk_import_rows
     SET rollback_state = 'rolled_back',
         updated_at = now()
   WHERE id = p_row_id;

  RETURN jsonb_build_object(
    'action','rolled_back',
    'row_id', p_row_id,
    'deleted_workspace', v_created_workspace,
    'deleted_startup', v_created_startup AND NOT EXISTS (SELECT 1 FROM public.workspaces WHERE startup_id = v_startup_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_active_customer(jsonb, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_rollback(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_active_customer(jsonb, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_rollback(uuid) TO authenticated, service_role;
