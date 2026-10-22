-- RC11 · Parte B — restantes defeitos MED e LOW da base de dados (contas suspensas, reservas, claims, politicas)
-- Migracao nova. Idempotente: CREATE OR REPLACE, DROP ... IF EXISTS, DO com guardas. Pode correr duas vezes sem erro.

-- ── B1. Conta suspensa deixa de ter poderes de staff, backoffice ou admin ──
CREATE OR REPLACE FUNCTION public.account_not_suspended(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.account_status = 'suspended'
  )
$function$;
REVOKE ALL ON FUNCTION public.account_not_suspended(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_not_suspended(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_not_suspended(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'consultor')
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_not_suspended(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_admin_only()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_not_suspended(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_backoffice()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_not_suspended(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('backoffice','admin')
  )
$function$;
CREATE OR REPLACE FUNCTION public.can_access_backoffice()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_not_suspended(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'backoffice')
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_account_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND account_status = 'approved'
  )
  -- Staff bypass for internal operations (never for suspended accounts)
  OR (public.account_not_suspended(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'consultor')
  ));
$function$;
-- has_workspace_access e can_write_workspace (Parte A) consultam user_roles diretamente para consultores: alinhar
CREATE OR REPLACE FUNCTION public.has_workspace_access(_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin()
    OR (public.account_not_suspended(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'consultor'
    ))
    OR (
      public.is_account_active()
      AND EXISTS (
        SELECT 1 FROM public.workspace_users wu
        JOIN public.workspaces w ON w.id = wu.workspace_id
        WHERE wu.user_id = auth.uid()
          AND wu.workspace_id = _workspace_id
          AND wu.active = true
          AND w.status <> 'blocked'
          AND w.blocked_at IS NULL
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role = 'mentor_externo'
        )
        OR public.has_accepted_nda(auth.uid())
      )
    );
$function$;
CREATE OR REPLACE FUNCTION public.has_workspace_access(_user_id uuid, _workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (public.account_not_suspended(_user_id) AND public.is_admin(_user_id))
    OR (public.account_not_suspended(_user_id) AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'consultor'
    ))
    OR (
      public.is_account_active(_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.workspace_users wu
        JOIN public.workspaces w ON w.id = wu.workspace_id
        WHERE wu.user_id = _user_id
          AND wu.workspace_id = _workspace_id
          AND wu.active = true
          AND w.status <> 'blocked'
          AND w.blocked_at IS NULL
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = _user_id AND role = 'mentor_externo'
        )
        OR public.has_accepted_nda(_user_id)
      )
    );
$function$;
CREATE OR REPLACE FUNCTION public.can_write_workspace(_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin()
    OR (public.account_not_suspended(auth.uid()) AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'consultor'::public.app_role
    ))
    OR (
      public.is_account_active()
      AND EXISTS (
        SELECT 1
        FROM public.workspace_users wu
        JOIN public.workspaces w ON w.id = wu.workspace_id
        WHERE wu.workspace_id = _workspace_id
          AND wu.user_id = auth.uid()
          AND wu.active = true
          AND wu.role IN ('founder'::public.app_role, 'consultor'::public.app_role)
          AND w.blocked_at IS NULL
      )
    );
$function$;

-- ── B2. Cancelar ou concluir uma reserva de mentoria propaga-se a sessao ligada ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.mentor_transition_booking(uuid,text)'::regprocedure);
  IF position('rc11_b2_session_sync' IN d) > 0 THEN RETURN; END IF;  -- ja aplicado
  IF position($q$  UPDATE public.mentor_bookings
     SET status = p_target_state,
         linked_session_id = COALESCE(v_session_id, linked_session_id),
         updated_at = now()
   WHERE id = v_booking.id;$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC11 B2: texto esperado nao encontrado em mentor_transition_booking';
  END IF;
  d := replace(d, $q$  UPDATE public.mentor_bookings
     SET status = p_target_state,
         linked_session_id = COALESCE(v_session_id, linked_session_id),
         updated_at = now()
   WHERE id = v_booking.id;$q$,
  $q$  UPDATE public.mentor_bookings
     SET status = p_target_state,
         linked_session_id = COALESCE(v_session_id, linked_session_id),
         updated_at = now()
   WHERE id = v_booking.id;

  -- rc11_b2_session_sync: a sessao criada na aceitacao segue o estado da reserva
  IF v_booking.linked_session_id IS NOT NULL THEN
    IF p_target_state = 'cancelled' THEN
      UPDATE public.sessions SET status = 'cancelled', updated_at = now()
       WHERE id = v_booking.linked_session_id AND status <> 'cancelled';
    ELSIF p_target_state = 'completed' THEN
      UPDATE public.sessions SET status = 'completed', updated_at = now()
       WHERE id = v_booking.linked_session_id AND status <> 'completed';
    END IF;
  END IF;$q$);
  EXECUTE d;
END $$;

-- ── B3. Reservas concorrentes para o mesmo mentor e dia ficam serializadas ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.prevent_mentor_booking_overlap()'::regprocedure);
  IF position('pg_advisory_xact_lock' IN d) > 0 THEN RETURN; END IF;
  IF position($q$  SELECT id, founder_id, requested_start_time, requested_end_time, status
    INTO conflict_row$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC11 B3: texto esperado nao encontrado em prevent_mentor_booking_overlap';
  END IF;
  d := replace(d, $q$  SELECT id, founder_id, requested_start_time, requested_end_time, status
    INTO conflict_row$q$,
  $q$  PERFORM pg_advisory_xact_lock(hashtext(NEW.mentor_id::text || ':' || NEW.requested_date::text));
  SELECT id, founder_id, requested_start_time, requested_end_time, status
    INTO conflict_row$q$);
  EXECUTE d;
END $$;

-- ── B4. Claims: rejeitar um pedido ja resolvido falha em vez de fingir sucesso; aprovar bloqueia a linha e valida o workspace ──
CREATE OR REPLACE FUNCTION public.reject_startup_claim(p_claim_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can reject claims';
  END IF;

  UPDATE startup_claim_requests
  SET status = 'rejected', resolved_at = now(), resolved_by = auth.uid(), notes = p_reason
  WHERE id = p_claim_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_not_pending' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_startup_claim(p_claim_id uuid, p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claim RECORD;
  v_admin_id UUID;
  v_ws_status text;
BEGIN
  v_admin_id := auth.uid();

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can approve claims';
  END IF;

  SELECT * INTO v_claim FROM startup_claim_requests WHERE id = p_claim_id AND status = 'pending' FOR UPDATE;
  IF v_claim IS NULL THEN
    RAISE EXCEPTION 'Claim not found or already resolved';
  END IF;

  SELECT status INTO v_ws_status FROM workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF v_ws_status IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;
  IF v_ws_status IN ('archived', 'rejected') THEN
    RAISE EXCEPTION 'workspace_archived_or_rejected' USING ERRCODE = '22023';
  END IF;

  INSERT INTO workspace_users (workspace_id, user_id, role, active)
  VALUES (p_workspace_id, v_claim.user_id, 'founder', true)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET active = true, role = 'founder';

  -- Activate only workspaces that are waiting for a founder; never reset onboarding of an active one
  IF v_ws_status IN ('imported_unclaimed', 'claimed') THEN
    UPDATE workspaces
    SET status = 'active',
        needs_onboarding = false,
        updated_at = now()
    WHERE id = p_workspace_id;
  END IF;

  INSERT INTO user_roles (user_id, role) VALUES (v_claim.user_id, 'founder') ON CONFLICT DO NOTHING;

  UPDATE profiles
  SET account_status = 'approved', updated_at = now()
  WHERE id = v_claim.user_id AND account_status = 'pending';

  UPDATE startup_claim_requests
  SET status = 'approved', workspace_id = p_workspace_id, resolved_at = now(), resolved_by = v_admin_id
  WHERE id = p_claim_id;
END;
$function$;

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.staff_create_workspace_for_claim(uuid,text,uuid,text,text)'::regprocedure);
  IF position('FOR UPDATE' IN d) = 0 THEN
    IF position($q$  WHERE id = p_claim_id AND status = 'pending';$q$ IN d) = 0 THEN
      RAISE EXCEPTION 'RC11 B4: texto esperado nao encontrado em staff_create_workspace_for_claim';
    END IF;
    d := replace(d, $q$  WHERE id = p_claim_id AND status = 'pending';$q$, $q$  WHERE id = p_claim_id AND status = 'pending'
  FOR UPDATE;$q$);
  END IF;
  IF position($q$  VALUES (v_workspace_id, v_claim.user_id, 'founder', true)
  ON CONFLICT DO NOTHING;$q$ IN d) > 0 THEN
    d := replace(d, $q$  VALUES (v_workspace_id, v_claim.user_id, 'founder', true)
  ON CONFLICT DO NOTHING;$q$, $q$  VALUES (v_workspace_id, v_claim.user_id, 'founder', true)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET active = true, role = 'founder';$q$);
  END IF;
  EXECUTE d;
END $$;

-- ── B5. 'Associar' reativa uma adesao desativada em vez de declarar sucesso sem efeito ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.staff_assign_or_create_workspace(uuid,text,uuid,text,uuid,text,text)'::regprocedure);
  IF position($q$    VALUES (v_workspace_id, p_user_id, 'founder', true)
    ON CONFLICT DO NOTHING;$q$ IN d) = 0 THEN RETURN; END IF;  -- ja aplicado
  d := replace(d, $q$    VALUES (v_workspace_id, p_user_id, 'founder', true)
    ON CONFLICT DO NOTHING;$q$, $q$    VALUES (v_workspace_id, p_user_id, 'founder', true)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET active = true, role = 'founder';$q$);
  EXECUTE d;
END $$;

-- ── B6. Reconciliacao de leads por email: so founders ativos e nunca com ambiguidade ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.crm_reconcile_orphans(boolean)'::regprocedure);
  IF position('ambiguous_email' IN d) > 0 THEN RETURN; END IF;
  IF position($q$      SELECT wu.workspace_id INTO v_workspace
      FROM public.workspace_users wu
      JOIN public.profiles p ON p.id = wu.user_id
      WHERE lower(p.email) = lower(r.contact_email)
      LIMIT 1;
      IF v_workspace IS NOT NULL THEN v_via := COALESCE(v_via, 'email'); END IF;$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC11 B6: texto esperado nao encontrado em crm_reconcile_orphans';
  END IF;
  d := replace(d, $q$      SELECT wu.workspace_id INTO v_workspace
      FROM public.workspace_users wu
      JOIN public.profiles p ON p.id = wu.user_id
      WHERE lower(p.email) = lower(r.contact_email)
      LIMIT 1;
      IF v_workspace IS NOT NULL THEN v_via := COALESCE(v_via, 'email'); END IF;$q$,
  $q$      IF (SELECT count(DISTINCT wu.workspace_id)
            FROM public.workspace_users wu
            JOIN public.profiles p ON p.id = wu.user_id
           WHERE lower(p.email) = lower(r.contact_email)
             AND wu.active = true AND wu.role = 'founder'::public.app_role) = 1 THEN
        SELECT wu.workspace_id INTO v_workspace
        FROM public.workspace_users wu
        JOIN public.profiles p ON p.id = wu.user_id
        WHERE lower(p.email) = lower(r.contact_email)
          AND wu.active = true AND wu.role = 'founder'::public.app_role
        LIMIT 1;
        IF v_workspace IS NOT NULL THEN v_via := COALESCE(v_via, 'email'); END IF;
      ELSIF EXISTS (SELECT 1 FROM public.workspace_users wu JOIN public.profiles p ON p.id = wu.user_id
                     WHERE lower(p.email) = lower(r.contact_email) AND wu.active = true AND wu.role = 'founder'::public.app_role) THEN
        v_via := COALESCE(v_via, 'ambiguous_email');  -- mais de um workspace: fica para revisao manual
      END IF;$q$);
  EXECUTE d;
END $$;

-- ── B7. Conversas: so com quem partilha um workspace (ou staff) e so em workspaces a que se tem acesso ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.create_conversation(uuid[],text,uuid)'::regprocedure);
  IF position('participant_not_allowed' IN d) > 0 THEN RETURN; END IF;
  IF position($q$  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;$q$ IN d) = 0 OR position($q$      IF v_participant IS NULL OR v_participant = v_user_id THEN
        CONTINUE;
      END IF;$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC11 B7: texto esperado nao encontrado em create_conversation';
  END IF;
  d := replace(d, $q$  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;$q$, $q$  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _workspace_id IS NOT NULL AND NOT public.has_workspace_access(_workspace_id) THEN
    RAISE EXCEPTION 'workspace_access_denied' USING ERRCODE = '42501';
  END IF;$q$);
  d := replace(d, $q$      IF v_participant IS NULL OR v_participant = v_user_id THEN
        CONTINUE;
      END IF;$q$, $q$      IF v_participant IS NULL OR v_participant = v_user_id THEN
        CONTINUE;
      END IF;
      IF NOT (public.is_staff() OR public.can_notify_user(v_participant)) THEN
        RAISE EXCEPTION 'participant_not_allowed' USING ERRCODE = '42501';
      END IF;$q$);
  EXECUTE d;
END $$;

-- ── B8. Contrato novo assinado num workspace arquivado volta a ativa-lo; bloqueado ou rejeitado e sinalizado ──
CREATE OR REPLACE FUNCTION public.activate_workspace_for_signed_contract(p_contract_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ws uuid; v_status text; v_current text; v_blocked timestamptz;
BEGIN
  IF NOT (public.is_staff() OR public.is_backoffice()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT workspace_id INTO v_ws FROM public.startup_contracts
   WHERE id = p_contract_id AND status = 'active' AND signed_at IS NOT NULL;
  IF v_ws IS NULL THEN RETURN 'no_signed_contract'; END IF;
  SELECT w.status, w.blocked_at INTO v_current, v_blocked FROM public.workspaces w WHERE w.id = v_ws FOR UPDATE;
  IF v_blocked IS NOT NULL THEN RETURN 'workspace_blocked'; END IF;
  IF v_current = 'rejected' THEN RETURN 'workspace_rejected'; END IF;
  -- liga ja o representante legal, se tiver conta (idempotente; o cron horario faz o mesmo)
  PERFORM public.reconcile_contract_founders(p_contract_id);
  -- validate_workspace_status_transition recusa ativar sem membros: avisar em vez de rebentar
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users wu WHERE wu.workspace_id = v_ws AND wu.active) THEN
    RETURN 'awaiting_founder';
  END IF;
  UPDATE public.workspaces SET status = 'active', archived_at = NULL, updated_at = now()
   WHERE id = v_ws AND status IN ('pending','claimed','imported_unclaimed','archived')
  RETURNING status INTO v_status;
  RETURN COALESCE(v_status, 'unchanged');
END; $function$;

-- ── B9. Eliminar utilizador: suspender e desligar em vez de um DELETE que falha por chaves estrangeiras ──
CREATE OR REPLACE FUNCTION public.staff_delete_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Dezenas de tabelas referenciam auth.users sem ON DELETE: a eliminacao fisica falhava e revertia tudo.
  -- Desativar: sem papeis, sem adesoes, conta suspensa. A remocao em auth.users fica para uma edge function
  -- com auth.admin.deleteUser depois de anonimizar as referencias.
  UPDATE public.workspace_users SET active = false WHERE user_id = target_user_id AND active = true;
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  UPDATE public.profiles SET account_status = 'suspended', updated_at = now() WHERE id = target_user_id;

  INSERT INTO public.activity_log (user_id, entity_type, entity_id, action, metadata)
  VALUES (auth.uid(), 'user', target_user_id, 'user_deactivated', jsonb_build_object('mode', 'soft_delete'));
END;
$function$;

-- ── B10. Alertas automaticos: chaves de baseline alinhadas e caixas desativadas fora do alerta de sync ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.check_ecosystem_invariants()'::regprocedure);
  IF position($q$value->>'orphan_contract'$q$ IN d) > 0 THEN RETURN; END IF;
  IF position($q$      COALESCE((value->>'orphan_contracts')::int,  v_baseline_orphans),
      COALESCE((value->>'unlinked_contracted')::int, v_baseline_unlinked)$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC11 B10: texto esperado nao encontrado em check_ecosystem_invariants';
  END IF;
  d := replace(d, $q$      COALESCE((value->>'orphan_contracts')::int,  v_baseline_orphans),
      COALESCE((value->>'unlinked_contracted')::int, v_baseline_unlinked)$q$,
  $q$      COALESCE((COALESCE(value->>'orphan_contract', value->>'orphan_contracts'))::int,  v_baseline_orphans),
      COALESCE((COALESCE(value->>'unlinked_contracted_funnel', value->>'unlinked_contracted'))::int, v_baseline_unlinked)$q$);
  EXECUTE d;
END $$;
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.check_email_sync_health()'::regprocedure);
  IF position($q$'disabled'$q$ IN d) > 0 THEN RETURN; END IF;
  IF position($q$   WHERE last_success_at IS NOT NULL AND last_success_at < now()-interval '2 hours';$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC11 B10: texto esperado nao encontrado em check_email_sync_health';
  END IF;
  d := replace(d, $q$   WHERE last_success_at IS NOT NULL AND last_success_at < now()-interval '2 hours';$q$,
  $q$   WHERE last_success_at IS NOT NULL AND last_success_at < now()-interval '2 hours'
     AND COALESCE(sync_state, '') <> 'disabled';$q$);
  EXECUTE d;
END $$;

-- ── B11. Politicas: WITH CHECK e filtros em falta ──
-- descontos: so founders do workspace (nao mentores ou team members)
DROP POLICY IF EXISTS "Founders can view own contract discounts" ON public.contract_discounts;
CREATE POLICY "Founders can view own contract discounts" ON public.contract_discounts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.startup_contracts sc
    WHERE sc.id = contract_discounts.contract_id AND sc.workspace_id IS NOT NULL AND public.is_founder(sc.workspace_id)));
-- tipos de incubacao: membros do workspace veem o tipo dos seus contratos
DROP POLICY IF EXISTS "Workspace members can view their contract incubation types" ON public.incubation_types;
CREATE POLICY "Workspace members can view their contract incubation types" ON public.incubation_types
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.startup_contracts sc
    WHERE sc.incubation_type_id = incubation_types.id AND sc.workspace_id IS NOT NULL
      AND public.has_workspace_access(sc.workspace_id)));
-- eventos de assinatura: consultor so dos workspaces que lhe estao atribuidos
DROP POLICY IF EXISTS cse_assigned_consultant_read ON public.contract_signature_events;
CREATE POLICY cse_assigned_consultant_read ON public.contract_signature_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'consultor'::app_role) AND EXISTS (
    SELECT 1 FROM public.startup_contracts sc
    JOIN public.workspaces w ON w.id = sc.workspace_id
    WHERE sc.id = contract_signature_events.contract_id
      AND (w.assigned_consultor_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.workspace_users wu
                       WHERE wu.workspace_id = w.id AND wu.user_id = auth.uid()
                         AND wu.role = 'consultor'::app_role AND wu.active = true))));
-- comentarios e revisoes: UPDATE nao pode mover a linha para outro workspace
DROP POLICY IF EXISTS "Users can update own comments" ON public.action_comments;
CREATE POLICY "Users can update own comments" ON public.action_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.action_items ai WHERE ai.id = action_comments.action_id AND public.can_write_workspace(ai.workspace_id)));
DROP POLICY IF EXISTS "Reviewers can update own reviews" ON public.document_reviews;
CREATE POLICY "Reviewers can update own reviews" ON public.document_reviews
  FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid() OR public.is_admin())
  WITH CHECK ((reviewer_id = auth.uid() OR public.is_admin()) AND public.has_workspace_access(workspace_id));
-- revisoes de fase: o founder so pede, nunca aprova
DROP POLICY IF EXISTS "Founders can request reviews" ON public.stage_gate_reviews;
CREATE POLICY "Founders can request reviews" ON public.stage_gate_reviews
  FOR INSERT TO authenticated
  WITH CHECK (public.is_founder(workspace_id) AND status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
              AND conditions IS NULL AND (requested_by IS NULL OR requested_by = auth.uid()));
-- pedidos de claim: so via RPC claim_startup (a politica direta permitia forjar email e startup)
DROP POLICY IF EXISTS "Users can create own claim requests" ON public.startup_claim_requests;
-- notificacoes entre membros: links so internos
DROP POLICY IF EXISTS "Members can notify workspace peers" ON public.notifications;
CREATE POLICY "Members can notify workspace peers" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.can_notify_user(user_id) AND (link IS NULL OR link LIKE '/%'));
-- recursos: mentores so gerem recursos proprios, nunca globais ou de programa
DROP POLICY IF EXISTS "Mentors can manage their own resources" ON public.resources;
CREATE POLICY "Mentors can manage their own resources" ON public.resources
  FOR ALL TO authenticated
  USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'mentor_externo'::app_role))
  WITH CHECK (created_by = auth.uid() AND public.has_role(auth.uid(), 'mentor_externo'::app_role)
              AND is_global = false AND program_id IS NULL);

-- ── B12. Check-ins: o founder nao se auto-revisa ──
CREATE OR REPLACE FUNCTION public.guard_checkin_review_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.is_staff() OR public.is_backoffice() THEN RETURN NEW; END IF;
  IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.definition_id IS DISTINCT FROM OLD.definition_id
     OR NEW.week_start IS DISTINCT FROM OLD.week_start OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    RAISE EXCEPTION 'checkin_review_fields_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_checkin_review_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_checkin_review_columns ON public.checkin_instances;
CREATE TRIGGER trg_guard_checkin_review_columns
  BEFORE UPDATE ON public.checkin_instances
  FOR EACH ROW EXECUTE FUNCTION public.guard_checkin_review_columns();

-- ── B13. Resumos de relacao: audiencia explicita; founders so veem resumos marcados como partilhados ──
ALTER TABLE public.relationship_recaps ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'staff';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relationship_recaps_audience_check') THEN
    ALTER TABLE public.relationship_recaps ADD CONSTRAINT relationship_recaps_audience_check CHECK (audience IN ('staff', 'shared'));
  END IF;
END $$;
DROP POLICY IF EXISTS "Founders can view workspace recaps" ON public.relationship_recaps;
CREATE POLICY "Founders can view workspace recaps" ON public.relationship_recaps
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND audience = 'shared' AND public.has_workspace_access(workspace_id));
