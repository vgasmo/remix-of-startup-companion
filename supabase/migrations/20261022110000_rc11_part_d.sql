-- RC11 Parte D (D.0, D.3, D.4, D.9)
-- D.0: impedir dois leads no mesmo slot do mesmo consultor
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.commit_first_contact_booking_atomic(text,jsonb,jsonb,uuid,uuid,jsonb,jsonb)'::regprocedure);
  IF position('slot_taken' IN d) > 0 THEN RETURN; END IF;
  d := replace(d, $q$  IF v_email = '' THEN RAISE EXCEPTION 'email_required'; END IF;$q$,
  $q$  IF v_email = '' THEN RAISE EXCEPTION 'email_required'; END IF;
  IF p_consultant_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('first_contact_slot:' || p_consultant_id::text || ':' || v_first_contact_at::text));
    IF EXISTS (SELECT 1 FROM public.funnel_items fi
                WHERE fi.owner_consultant_id = p_consultant_id
                  AND fi.first_contact_at = v_first_contact_at
                  AND fi.stage = 'first_contact_booked'
                  AND lower(coalesce(fi.contact_email,'')) <> v_email
                  AND coalesce(fi.metadata_json->>'idempotency_key','') <> coalesce(p_idempotency_key,'')) THEN
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;
  END IF;$q$);
  EXECUTE d;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_funnel_public_booking_slot
  ON public.funnel_items (owner_consultant_id, first_contact_at)
  WHERE source = 'public_booking' AND stage = 'first_contact_booked';

-- D.3: numero de contrato unico (sem duplicados em producao, verificado)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_startup_contracts_inc_number
  ON public.startup_contracts (contract_number) WHERE contract_number ~ '^INC-\d{4}-\d+$';

-- D.4: claim ativa logo; remover UPDATE morto para 'claimed'
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.claim_startup()'::regprocedure);
  IF position($q$SET status = 'claimed', needs_onboarding = true$q$ IN d) = 0 THEN RETURN; END IF;
  d := replace(d, $q$    UPDATE workspaces
       SET status = 'claimed', needs_onboarding = true, updated_at = now()
     WHERE id = v_match.workspace_id AND status = 'imported_unclaimed';
$q$, $q$    -- D.4: trg_auto_activate_workspace_on_founder ativa o workspace no INSERT acima (sem onboarding)
$q$);
  EXECUTE d;
END $$;

-- D.9: kill switch considera tambem founders por adesao ao workspace
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.founder_notifications_blocked(uuid)'::regprocedure);
  IF position('workspace_users' IN d) > 0 THEN RETURN; END IF;
  d := replace(d, $q$  RETURN public.has_role(_user_id, 'founder') OR public.has_role(_user_id, 'team_member');$q$,
  $q$  RETURN public.has_role(_user_id, 'founder') OR public.has_role(_user_id, 'team_member')
    OR EXISTS (SELECT 1 FROM public.workspace_users wu WHERE wu.user_id = _user_id AND wu.active
               AND wu.role IN ('founder'::public.app_role, 'team_member'::public.app_role));$q$);
  EXECUTE d;
END $$;