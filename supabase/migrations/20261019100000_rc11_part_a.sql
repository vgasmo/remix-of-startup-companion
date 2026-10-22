-- RC11 · Parte A — correcoes de seguranca e integridade na base de dados confirmadas na BD replayed
-- Migracao nova. Idempotente: CREATE OR REPLACE, DROP ... IF EXISTS, DO com guardas. Pode correr duas vezes sem erro.
-- Nunca reaplicar migracoes antigas.

-- ── A1. Conversas: so quem ja participa pode adicionar participantes; a propria participacao so muda last_read_at ──
DROP POLICY IF EXISTS "Users can add participants to conversations they're in" ON public.conversation_participants;
DROP POLICY IF EXISTS "Participants can add participants" ON public.conversation_participants;
CREATE POLICY "Participants can add participants" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_conversation_participant(auth.uid(), conversation_id));
DROP POLICY IF EXISTS "Users can update their own participation" ON public.conversation_participants;
CREATE POLICY "Users can update their own participation" ON public.conversation_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- impedir mudar conversation_id ou user_id da propria participacao (o cliente so escreve last_read_at)
CREATE OR REPLACE FUNCTION public.guard_conversation_participant_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.is_staff() THEN RETURN NEW; END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'participation_fields_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_conversation_participant_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_conversation_participant_columns ON public.conversation_participants;
CREATE TRIGGER trg_guard_conversation_participant_columns
  BEFORE UPDATE ON public.conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_participant_columns();

-- ── A2. publish_program_setup: aceitar a chamada da edge function feita com service_role (auth.uid() e NULL) ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.publish_program_setup(uuid,uuid,jsonb,jsonb)'::regprocedure);
  IF position($q$v_jwt_role_rc11$q$ IN d) > 0 THEN RETURN; END IF;  -- ja aplicado
  IF position($q$  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'consultor'::app_role)) THEN
    RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
  END IF;$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC11 A2: texto esperado nao encontrado em publish_program_setup';
  END IF;
  d := replace(d, $q$  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'consultor'::app_role)) THEN
    RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
  END IF;$q$,
  $q$  -- v_jwt_role_rc11: a edge function publish-program-setup chama com service_role e ja validou o papel do utilizador
  IF coalesce(current_setting('request.jwt.claim.role', true),
              NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'consultor'::app_role)) THEN
      RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;
  END IF;$q$);
  EXECUTE d;
END $$;

-- ── A3. Entregaveis: founders editam, mas so o staff valida (completed_at, completed_by) ──
CREATE OR REPLACE FUNCTION public.guard_deliverable_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.is_staff() THEN RETURN NEW; END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.completed_by IS DISTINCT FROM OLD.completed_by THEN
    RAISE EXCEPTION 'only_staff_can_validate_deliverables' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_deliverable_completion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_deliverable_completion ON public.action_deliverables;
CREATE TRIGGER trg_guard_deliverable_completion
  BEFORE UPDATE ON public.action_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.guard_deliverable_completion();

-- ── A4. ai_rate_limits: o utilizador so le a propria linha; escreve apenas check_ai_rate_limit e service_role ──
DROP POLICY IF EXISTS "Users can manage own rate limits" ON public.ai_rate_limits;
REVOKE INSERT, UPDATE, DELETE ON public.ai_rate_limits FROM anon, authenticated;

-- ── A5. Faturas e pagamentos: staff, backoffice e founders do workspace; nunca mentores ou team members ──
DROP POLICY IF EXISTS "View invoices" ON public.invoices;
CREATE POLICY "View invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_backoffice() OR public.is_founder(workspace_id));
DROP POLICY IF EXISTS "View payments" ON public.payments;
CREATE POLICY "View payments" ON public.payments
  FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_backoffice() OR public.is_founder(workspace_id));

-- ── A6. Reservas de mentoria: WITH CHECK explicito (o founder passa a conseguir cancelar) e campos imutaveis ──
DROP POLICY IF EXISTS "Founders can cancel their bookings" ON public.mentor_bookings;
CREATE POLICY "Founders can cancel their bookings" ON public.mentor_bookings
  FOR UPDATE TO authenticated
  USING (auth.uid() = founder_id AND status = 'pending')
  WITH CHECK (auth.uid() = founder_id AND status IN ('pending', 'cancelled'));
DROP POLICY IF EXISTS "Mentors can update booking status" ON public.mentor_bookings;
CREATE POLICY "Mentors can update booking status" ON public.mentor_bookings
  FOR UPDATE TO authenticated
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);
CREATE OR REPLACE FUNCTION public.guard_mentor_booking_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.is_staff() THEN RETURN NEW; END IF;
  IF NEW.mentor_id IS DISTINCT FROM OLD.mentor_id OR NEW.founder_id IS DISTINCT FROM OLD.founder_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.requested_date IS DISTINCT FROM OLD.requested_date
     OR NEW.requested_start_time IS DISTINCT FROM OLD.requested_start_time
     OR NEW.requested_end_time IS DISTINCT FROM OLD.requested_end_time THEN
    RAISE EXCEPTION 'booking_fields_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_mentor_booking_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_mentor_booking_columns ON public.mentor_bookings;
CREATE TRIGGER trg_guard_mentor_booking_columns
  BEFORE UPDATE ON public.mentor_bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_mentor_booking_columns();

-- ── A7. Ligacoes de mentoria: o mentor so muda status e responded_at ──
DROP POLICY IF EXISTS "Mentors can update connection status" ON public.mentor_connections;
CREATE POLICY "Mentors can update connection status" ON public.mentor_connections
  FOR UPDATE TO authenticated
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id AND status IN ('accepted', 'declined'));
CREATE OR REPLACE FUNCTION public.guard_mentor_connection_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.is_staff() THEN RETURN NEW; END IF;
  IF NEW.mentor_id IS DISTINCT FROM OLD.mentor_id OR NEW.founder_id IS DISTINCT FROM OLD.founder_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'connection_fields_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_mentor_connection_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_mentor_connection_columns ON public.mentor_connections;
CREATE TRIGGER trg_guard_mentor_connection_columns
  BEFORE UPDATE ON public.mentor_connections
  FOR EACH ROW EXECUTE FUNCTION public.guard_mentor_connection_columns();

-- ── A8. Revisoes internas e fila do staff: fora do alcance de mentores externos ──
DROP POLICY IF EXISTS "Staff can view ritual instances" ON public.ritual_instances;
CREATE POLICY "Staff can view ritual instances" ON public.ritual_instances
  FOR SELECT TO authenticated
  USING (public.is_staff() OR (workspace_id IS NOT NULL AND public.is_founder(workspace_id)));
DROP POLICY IF EXISTS "Staff can view work queue items for accessible workspaces" ON public.staff_work_queue_items;
CREATE POLICY "Staff can view work queue items for accessible workspaces" ON public.staff_work_queue_items
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- ── A9. Bloqueio de workspace passa a ter efeito: blocked_at retira acesso a membros nao staff ──
CREATE OR REPLACE FUNCTION public.has_workspace_access(_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'consultor'
    )
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
    public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'consultor'
    )
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
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'consultor'::public.app_role
    )
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

-- ── A10. RPCs sem guarda que nao devem ser chamadas pelo cliente ──
REVOKE EXECUTE ON FUNCTION public.get_next_intake_consultant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_intake_consultant(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.transition_mentor_booking_atomic(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_mentor_booking_atomic(uuid, text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.save_financial_scenario_atomic(uuid, timestamptz, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_financial_scenario_atomic(uuid, timestamptz, jsonb, jsonb, text) TO service_role;

-- ── A11. materialize_acceleration_deliverables: exige escrita no workspace e programa coerente ──
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.materialize_acceleration_deliverables(uuid,uuid)'::regprocedure);
  IF position('program_mismatch' IN d) > 0 THEN RETURN; END IF;  -- ja aplicado
  IF position($q$IF NOT has_workspace_access(p_workspace_id) THEN$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'RC11 A11: texto esperado nao encontrado em materialize_acceleration_deliverables';
  END IF;
  d := replace(d, $q$IF NOT has_workspace_access(p_workspace_id) THEN$q$,
    $q$IF NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = p_workspace_id AND w.program_id = p_program_id) THEN
    RAISE EXCEPTION 'program_mismatch' USING ERRCODE = '22023';
  END IF;
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.can_write_workspace(p_workspace_id)) THEN$q$);
  EXECUTE d;
END $$;
REVOKE EXECUTE ON FUNCTION public.materialize_acceleration_deliverables(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materialize_acceleration_deliverables(uuid, uuid) TO authenticated, service_role;

-- ── A12. communication_log: um unico trigger de last_activity_at, com GREATEST, e reparacao dos dados ──
DROP TRIGGER IF EXISTS trigger_update_funnel_last_activity ON public.communication_log;
DROP FUNCTION IF EXISTS public.update_funnel_item_last_activity();
UPDATE public.funnel_items f
   SET last_activity_at = s.m
  FROM (SELECT funnel_item_id, max(occurred_at) AS m FROM public.communication_log
         WHERE funnel_item_id IS NOT NULL GROUP BY funnel_item_id) s
 WHERE s.funnel_item_id = f.id AND (f.last_activity_at IS NULL OR f.last_activity_at < s.m);

-- ── A13. Numero de contrato: serializado por ano e sem truncar a partir do 1000.o ──
CREATE OR REPLACE FUNCTION public.generate_contract_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year text;
  v_seq int;
BEGIN
  IF NEW.contract_number IS NULL OR NEW.contract_number = '' THEN
    v_year := to_char(CURRENT_DATE, 'YYYY');
    PERFORM pg_advisory_xact_lock(hashtext('contract_number:' || v_year));
    SELECT COALESCE(MAX(
      CASE
        WHEN contract_number ~ ('^INC-' || v_year || '-\d+$')
        THEN CAST(split_part(contract_number, '-', 3) AS int)
        ELSE 0
      END
    ), 0) + 1 INTO v_seq
    FROM startup_contracts;
    NEW.contract_number := 'INC-' || v_year || '-' || LPAD(v_seq::text, GREATEST(3, length(v_seq::text)), '0');
  END IF;
  RETURN NEW;
END;
$function$;

-- ── A14. ensure_dataroom_exists: exige escrita no workspace e e atomico ──
CREATE OR REPLACE FUNCTION public.ensure_dataroom_exists(_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_dataroom_id uuid;
BEGIN
    IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.is_staff() OR public.can_write_workspace(_workspace_id)) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('dataroom:' || _workspace_id::text));
    SELECT id INTO v_dataroom_id FROM public.datarooms WHERE workspace_id = _workspace_id;
    IF v_dataroom_id IS NULL THEN
        INSERT INTO public.datarooms (workspace_id) VALUES (_workspace_id) RETURNING id INTO v_dataroom_id;
    END IF;
    RETURN v_dataroom_id;
END;
$function$;

-- ── A15. share_links: trigger que referencia a coluna token, ja removida ──
DROP TRIGGER IF EXISTS hash_share_link_token_trigger ON public.share_links;
DROP FUNCTION IF EXISTS public.hash_share_link_token();

-- ── A16. Helpers com uuid alvo devolvem false em pedidos anonimos (nao se revoga EXECUTE: ha politicas FOR public que os avaliam) ──
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN coalesce(current_setting('request.jwt.claim.role', true),
                  NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'anon' THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN coalesce(current_setting('request.jwt.claim.role', true),
                  NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'anon' THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE user_id = _user_id AND conversation_id = _conversation_id
    )
  END
$function$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO anon, authenticated, service_role;
