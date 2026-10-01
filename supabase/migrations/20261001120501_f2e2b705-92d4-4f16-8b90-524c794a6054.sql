-- RC10 · Parte A — cadeia contrato assinado → workspace → conta do founder → onboarding
-- Migração nova. Só CREATE OR REPLACE e UPDATEs com guarda: pode correr duas vezes sem erro.

-- ── A1. Contrato do CRM sem workspace: criar ou reutilizar startup + workspace (idempotente) ──
CREATE OR REPLACE FUNCTION public.ensure_contract_workspace(p_contract_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_c public.startup_contracts%ROWTYPE; v_i public.contract_intakes%ROWTYPE; v_f public.funnel_items%ROWTYPE;
  v_prog uuid; v_startup uuid; v_ws uuid; v_owner uuid;
BEGIN
  IF NOT (public.is_staff() OR public.is_backoffice() OR coalesce(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_c FROM public.startup_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_c.workspace_id IS NOT NULL THEN RETURN v_c.workspace_id; END IF;
  SELECT * INTO v_i FROM public.contract_intakes WHERE contract_id = p_contract_id ORDER BY created_at DESC LIMIT 1;
  IF COALESCE(v_c.funnel_item_id, v_i.funnel_item_id) IS NOT NULL THEN
    SELECT * INTO v_f FROM public.funnel_items WHERE id = COALESCE(v_c.funnel_item_id, v_i.funnel_item_id) FOR UPDATE;
  END IF;
  IF v_f.linked_workspace_id IS NOT NULL THEN
    v_ws := v_f.linked_workspace_id;  -- lead já convertida: reutilizar o workspace dela
  ELSE
    v_prog := v_f.program_id;
    IF v_prog IS NULL THEN
      SELECT CASE WHEN count(*) = 1 THEN (array_agg(id))[1] END INTO v_prog FROM public.programs WHERE is_active;
    END IF;
    IF v_prog IS NULL THEN
      RAISE EXCEPTION 'auto_mint_no_program: associe a lead a um programa e volte a sincronizar' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.startups (name, nif, address, website, description, main_contact_name, main_contact_email, main_contact_phone)
    VALUES (
      COALESCE(NULLIF(btrim(COALESCE(v_c.organization_name, v_i.organization_name, v_f.organization_name, '')), ''), 'Startup'),
      COALESCE(v_c.company_nif, v_i.company_nif),
      NULLIF(concat_ws(', ', COALESCE(v_c.company_address, v_i.company_address), COALESCE(v_c.company_postal_code, v_i.company_postal_code), COALESCE(v_c.company_city, v_i.company_city)), ''),
      CASE WHEN v_i.website ~* '^https?://' THEN v_i.website END,
      v_i.startup_description,
      COALESCE(v_c.legal_representative_name, v_i.legal_representative_name, v_f.contact_name),
      COALESCE(v_c.legal_representative_email, v_i.legal_representative_email, v_f.contact_email),
      COALESCE(v_c.legal_representative_phone, v_i.legal_representative_phone, v_f.contact_phone))
    RETURNING id INTO v_startup;
    -- só um consultor/admin fica como consultor atribuído (sync_assigned_consultor_to_members cria o membro)
    IF v_f.owner_consultant_id IS NOT NULL
       AND (public.has_role(v_f.owner_consultant_id, 'consultor'::public.app_role)
            OR public.has_role(v_f.owner_consultant_id, 'admin'::public.app_role)) THEN
      v_owner := v_f.owner_consultant_id;
    END IF;
    INSERT INTO public.workspaces (startup_id, program_id, status, needs_onboarding, assigned_consultor_id, created_by)
    VALUES (v_startup, v_prog, 'pending', true, v_owner, auth.uid()) RETURNING id INTO v_ws;
    IF v_f.id IS NOT NULL THEN
      UPDATE public.funnel_items SET linked_workspace_id = v_ws, linked_startup_id = v_startup, updated_at = now() WHERE id = v_f.id;
    END IF;
  END IF;
  UPDATE public.startup_contracts SET workspace_id = v_ws, updated_at = now() WHERE id = p_contract_id;
  RETURN v_ws;
END; $function$;
REVOKE ALL ON FUNCTION public.ensure_contract_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_contract_workspace(uuid) TO authenticated, service_role;

-- ── A1. 'Marcar como assinado': ligar já o founder e não rebentar num workspace sem membros ──
CREATE OR REPLACE FUNCTION public.activate_workspace_for_signed_contract(p_contract_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ws uuid; v_status text;
BEGIN
  IF NOT (public.is_staff() OR public.is_backoffice()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT workspace_id INTO v_ws FROM public.startup_contracts
   WHERE id = p_contract_id AND status = 'active' AND signed_at IS NOT NULL;
  IF v_ws IS NULL THEN RETURN 'no_signed_contract'; END IF;
  -- liga já o representante legal, se tiver conta (idempotente; o cron horário faz o mesmo)
  PERFORM public.reconcile_contract_founders(p_contract_id);
  -- validate_workspace_status_transition recusa ativar sem membros: avisar em vez de rebentar
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users wu WHERE wu.workspace_id = v_ws AND wu.active) THEN
    RETURN 'awaiting_founder';
  END IF;
  UPDATE public.workspaces SET status = 'active', updated_at = now()
   WHERE id = v_ws AND status IN ('pending','claimed','imported_unclaimed')
  RETURNING status INTO v_status;
  RETURN COALESCE(v_status, 'unchanged');
END; $$;
REVOKE ALL ON FUNCTION public.activate_workspace_for_signed_contract(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_workspace_for_signed_contract(uuid) TO authenticated;
-- ── A2. Reconciliação horária: um founder que já se tinha registado (pendente) fica aprovado ──
CREATE OR REPLACE FUNCTION public.reconcile_contract_founders(p_contract_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_auth_id uuid;
  v_email text;
  v_name text;
  v_checked int := 0;
  v_linked int := 0;
  v_invited int := 0;
  v_missing int := 0;
BEGIN
  FOR r IN
    SELECT c.id,
           c.workspace_id,
           lower(trim(c.legal_representative_email)) AS email,
           COALESCE(NULLIF(trim(c.legal_representative_name), ''), 'Founder') AS full_name
    FROM public.startup_contracts c
    WHERE c.status = 'active'
      AND c.workspace_id IS NOT NULL
      AND c.legal_representative_email IS NOT NULL
      AND c.legal_representative_email <> ''
      AND (p_contract_id IS NULL OR c.id = p_contract_id)
  LOOP
    v_checked := v_checked + 1;
    v_email := r.email;
    v_name := r.full_name;

    SELECT id INTO v_auth_id
    FROM auth.users
    WHERE lower(email) = v_email
    LIMIT 1;

    IF v_auth_id IS NULL THEN
      -- No auth account yet: enqueue triage so staff invites the founder.
      v_missing := v_missing + 1;
      BEGIN
        INSERT INTO public.staff_work_queue_items (
          workspace_id, type, title, description, priority, status, evidence_json
        ) VALUES (
          r.workspace_id,
          'triage',
          'Convidar founder — ' || v_name,
          'Contrato ativo sem conta de auth para ' || v_email || '. Convite manual necessário.',
          'high',
          'open',
          jsonb_build_object(
            'purpose', 'invite_founder',
            'contract_id', r.id,
            'reason', 'missing_auth_user',
            'email', v_email
          )
        );
      EXCEPTION WHEN unique_violation THEN
        -- Already queued (idx_work_queue_unique_active) — leave the open task in place.
        NULL;
      END;
      CONTINUE;
    END IF;

    -- Profile
    -- Perfil: cria aprovado; um perfil 'pending' (founder que se registou antes) passa a aprovado.
    -- Nunca reativa contas suspensas (só o admin, P1.1/P2.1).
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (v_auth_id, v_email, v_name, 'approved'::account_status)
    ON CONFLICT (id) DO UPDATE SET account_status = 'approved'::account_status, updated_at = now()
      WHERE public.profiles.account_status = 'pending'::account_status;

    -- Founder role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_auth_id, 'founder')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Workspace membership (active)
    INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
    VALUES (r.workspace_id, v_auth_id, 'founder', true)
    ON CONFLICT (workspace_id, user_id) DO UPDATE
      SET active = true,
          role = COALESCE(public.workspace_users.role, 'founder');

    v_linked := v_linked + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'checked', v_checked,
    'linked', v_linked,
    'invited', v_invited,
    'missing_auth', v_missing,
    'ran_at', now()
  );
END;
$function$;
-- ── A3. Links públicos de assinatura de contratos já fechados deixam de servir ──
UPDATE public.startup_contracts
   SET onboarding_token_hash = NULL, onboarding_token_expires_at = NULL, updated_at = now()
 WHERE onboarding_token_hash IS NOT NULL
   AND (status IN ('active', 'terminated', 'expired', 'suspended')
        OR signature_status IN ('completed', 'signed', 'partially_signed', 'declined', 'voided'));

-- ── A5. Links de assinatura já enviados sem fornecedor: são da assinatura nativa ──
UPDATE public.startup_contracts
   SET signature_provider = 'assinatura_digital', updated_at = now()
 WHERE signature_provider IS NULL AND onboarding_token_hash IS NOT NULL
   AND signed_at IS NULL AND status IN ('draft', 'pending_signature');

-- ── A6. Conversão em workspace: reaproveita o contrato da lead e só a marca como ganha com contrato assinado ──
CREATE OR REPLACE FUNCTION public.staff_convert_funnel_item_to_startup(p_funnel_item_id uuid, p_program_id uuid, p_stage text, p_incubation_type_id uuid DEFAULT NULL::uuid, p_building_id uuid DEFAULT NULL::uuid, p_square_meters numeric DEFAULT NULL::numeric, p_monthly_fee numeric DEFAULT NULL::numeric, p_project_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_health_notes text DEFAULT NULL::text, p_inferred_stage text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_item public.funnel_items%ROWTYPE;
  v_startup_id uuid;
  v_workspace_id uuid;
  v_contract_id uuid;
  v_final_stage text;
  v_project_name text;
  v_owner uuid;
  v_signed boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_staff() OR public.is_backoffice()) THEN
    RAISE EXCEPTION 'staff_only' USING ERRCODE = '42501';
  END IF;

  -- Lock the funnel row so a concurrent conversion of the same lead serialises behind us.
  SELECT * INTO v_item FROM public.funnel_items WHERE id = p_funnel_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'funnel_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: if this lead already resolved to a workspace, return it unchanged.
  IF v_item.linked_workspace_id IS NOT NULL THEN
    RETURN jsonb_build_object('startup_id', v_item.linked_startup_id, 'workspace_id', v_item.linked_workspace_id,
                              'contract_id', v_item.linked_contract_id, 'was_existing', true);
  END IF;

  v_project_name := COALESCE(NULLIF(trim(p_project_name), ''), v_item.organization_name, v_item.contact_name, 'New Startup');
  v_final_stage := COALESCE(NULLIF(trim(p_inferred_stage), ''), p_stage);
  -- só um consultor/admin pode ficar como consultor atribuído (o dono da lead pode ser do backoffice)
  v_owner := CASE WHEN v_item.owner_consultant_id IS NOT NULL
                   AND (public.has_role(v_item.owner_consultant_id, 'consultor'::public.app_role)
                        OR public.has_role(v_item.owner_consultant_id, 'admin'::public.app_role))
                  THEN v_item.owner_consultant_id END;

  -- 1. Startup
  INSERT INTO public.startups (name, description, main_contact_name, main_contact_email, main_contact_phone)
  VALUES (v_project_name, p_description, v_item.contact_name, v_item.contact_email, v_item.contact_phone)
  RETURNING id INTO v_startup_id;

  -- 2. Workspace (pending — activation happens on contract signing)
  INSERT INTO public.workspaces (startup_id, program_id, stage, status, assigned_consultor_id, health_notes, created_by)
  VALUES (v_startup_id, p_program_id, v_final_stage::public.startup_stage, 'pending', v_owner, p_health_notes, v_user)
  RETURNING id INTO v_workspace_id;

  -- 3. Staff membership so the workspace has an operational owner (o backoffice não fica membro, P2.2)
  INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
  SELECT v_workspace_id, v_user, 'consultor'::public.app_role, true WHERE public.is_staff()
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET active = true, role = 'consultor';

  -- 4. Contrato: reaproveitar o contrato em curso da lead (o ligado primeiro), ainda sem workspace e
  --    não arquivado/terminado, e ligá-lo ao workspace novo; senão, stub opcional como antes
  SELECT c.id INTO v_contract_id FROM public.startup_contracts c
   WHERE c.workspace_id IS NULL AND c.archived_at IS NULL
     AND c.status IN ('draft','pending_signature','active')
     AND (c.id = v_item.linked_contract_id OR c.funnel_item_id = p_funnel_item_id)
   ORDER BY (c.id IS NOT DISTINCT FROM v_item.linked_contract_id) DESC, c.created_at DESC
   LIMIT 1;
  IF v_contract_id IS NOT NULL THEN
    UPDATE public.startup_contracts SET workspace_id = v_workspace_id
     WHERE id = v_contract_id AND workspace_id IS NULL;
  ELSIF p_incubation_type_id IS NOT NULL THEN
    INSERT INTO public.startup_contracts (workspace_id, incubation_type_id, building_id, square_meters, monthly_fee,
                                          start_date, status, funnel_item_id, created_by)
    VALUES (v_workspace_id, p_incubation_type_id, p_building_id, p_square_meters, COALESCE(p_monthly_fee, 0),
            CURRENT_DATE, 'draft', p_funnel_item_id, v_user)
    RETURNING id INTO v_contract_id;
  END IF;

  -- 5. Lead: com contrato por assinar mantém a fase (a assinatura põe-na em 'contracted');
  --    sem contrato, ou com contrato assinado, conta como ganha (como antes)
  SELECT EXISTS (SELECT 1 FROM public.startup_contracts c
                  WHERE c.id = v_contract_id AND (c.signed_at IS NOT NULL OR c.signature_status IN ('completed','signed')))
    INTO v_signed;
  UPDATE public.funnel_items
     SET stage = CASE WHEN v_contract_id IS NOT NULL AND NOT v_signed THEN stage
                      ELSE (CASE WHEN p_stage = 'ideation' THEN 'incubating' ELSE 'accelerating' END) END,
         type = 'startup_active',
         linked_startup_id = v_startup_id,
         linked_workspace_id = v_workspace_id,
         linked_contract_id = COALESCE(v_contract_id, v_item.linked_contract_id),
         converted_at = now(),
         updated_at = now()
   WHERE id = p_funnel_item_id;

  -- 6. Event log
  INSERT INTO public.funnel_events (funnel_item_id, event_type, performed_by, metadata)
  VALUES (p_funnel_item_id, 'converted_to_startup', v_user,
          jsonb_build_object('startup_id', v_startup_id, 'workspace_id', v_workspace_id, 'contract_id', v_contract_id, 'signed', v_signed));

  RETURN jsonb_build_object('startup_id', v_startup_id, 'workspace_id', v_workspace_id, 'contract_id', v_contract_id, 'was_existing', false);
END;
$function$;

-- ── A8. Só os workspaces importados (claim) dispensam o assistente de onboarding ──
CREATE OR REPLACE FUNCTION public.auto_activate_workspace_on_founder()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'founder' AND NEW.active = true THEN
    UPDATE public.workspaces
       SET status = 'active',
           -- os criados por contrato, conversão ou atribuição mantêm needs_onboarding
           needs_onboarding = CASE WHEN status = 'imported_unclaimed' THEN false ELSE needs_onboarding END,
           updated_at = now()
     WHERE id = NEW.workspace_id
       AND status IN ('claimed', 'imported_unclaimed');
  END IF;
  RETURN NEW;
END;
$function$;

-- ── A8. P4.2: os dados legais de uma startup com contrato assinado só mudam por pedido de alteração ──
CREATE OR REPLACE FUNCTION public.startup_is_established(p_startup_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.startup_id = p_startup_id
                   AND w.status IN ('active','archived') AND w.needs_onboarding IS NOT TRUE)
      OR EXISTS (SELECT 1 FROM public.startup_contracts c JOIN public.workspaces w ON w.id = c.workspace_id
                  WHERE w.startup_id = p_startup_id
                    AND c.status IN ('active','suspended','terminated','expired'));
$$;
REVOKE ALL ON FUNCTION public.startup_is_established(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.startup_is_established(uuid) TO authenticated;

-- ── A10. Intakes presos em 'signature_sent' com o contrato recusado/anulado: fechar (param os lembretes) ──
UPDATE public.contract_intakes ci
   SET status = 'cancelled', updated_at = now()
  FROM public.startup_contracts c
 WHERE c.id = ci.contract_id
   AND ci.status = 'signature_sent'
   AND c.signature_status IN ('declined', 'voided');