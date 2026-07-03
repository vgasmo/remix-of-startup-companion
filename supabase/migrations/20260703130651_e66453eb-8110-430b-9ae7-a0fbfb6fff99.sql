
-- ============ C2: mentor_connections notification trigger ============
CREATE OR REPLACE FUNCTION public.notify_mentor_connection_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_founder_user uuid;
  v_workspace_name text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      SELECT s.name INTO v_workspace_name
        FROM public.workspaces w
        LEFT JOIN public.startups s ON s.id = w.startup_id
       WHERE w.id = NEW.workspace_id;

      INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
      VALUES (
        NEW.mentor_id,
        'mentor_connection_requested',
        'Novo pedido de ligação',
        COALESCE('Novo pedido de ligação de ' || v_workspace_name, 'Novo pedido de ligação'),
        '/mentors?tab=requests',
        jsonb_build_object('connection_id', NEW.id, 'workspace_id', NEW.workspace_id)
      );
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('accepted','declined') THEN
      FOR v_founder_user IN
        SELECT wu.user_id FROM public.workspace_users wu
         WHERE wu.workspace_id = NEW.workspace_id
           AND wu.role = 'founder' AND wu.active = true
      LOOP
        INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
        VALUES (
          v_founder_user,
          'mentor_connection_' || NEW.status,
          CASE WHEN NEW.status = 'accepted' THEN 'Ligação de mentor aceite' ELSE 'Ligação de mentor recusada' END,
          CASE WHEN NEW.status = 'accepted' THEN 'O mentor aceitou a sua ligação.' ELSE 'O mentor recusou a sua ligação.' END,
          '/mentors',
          jsonb_build_object('connection_id', NEW.id)
        );
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mentor_connection_change ON public.mentor_connections;
CREATE TRIGGER trg_notify_mentor_connection_change
AFTER INSERT OR UPDATE ON public.mentor_connections
FOR EACH ROW EXECUTE FUNCTION public.notify_mentor_connection_change();

DROP POLICY IF EXISTS "Workspace members can view mentor_connections" ON public.mentor_connections;
CREATE POLICY "Workspace members can view mentor_connections"
ON public.mentor_connections
FOR SELECT
TO authenticated
USING (workspace_id IS NOT NULL AND public.has_workspace_access(workspace_id));

-- ============ C2: mentor_bookings notification trigger ============
CREATE OR REPLACE FUNCTION public.notify_mentor_booking_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
      VALUES (
        NEW.mentor_id,
        'mentor_booking_requested',
        'Novo pedido de sessão',
        'Um founder solicitou uma sessão consigo.',
        '/mentors?tab=bookings',
        jsonb_build_object('booking_id', NEW.id, 'workspace_id', NEW.workspace_id, 'date', NEW.requested_date)
      );
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('accepted','declined','cancelled') THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
      VALUES (
        NEW.founder_id,
        'mentor_booking_' || NEW.status,
        CASE WHEN NEW.status = 'accepted' THEN 'Sessão confirmada'
             WHEN NEW.status = 'declined' THEN 'Sessão recusada'
             ELSE 'Sessão cancelada' END,
        'O mentor atualizou o estado do seu pedido de sessão.',
        '/mentors',
        jsonb_build_object('booking_id', NEW.id, 'date', NEW.requested_date)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mentor_booking_change ON public.mentor_bookings;
CREATE TRIGGER trg_notify_mentor_booking_change
AFTER INSERT OR UPDATE ON public.mentor_bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_mentor_booking_change();

-- ============ C2: RPC for busy mentor slots (no PII) ============
CREATE OR REPLACE FUNCTION public.get_mentor_busy_slots(
  p_mentor_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE(busy_date date, start_time time, end_time time)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT requested_date::date AS busy_date,
         requested_start_time::time AS start_time,
         requested_end_time::time AS end_time
    FROM public.mentor_bookings
   WHERE mentor_id = p_mentor_id
     AND requested_date BETWEEN p_from AND p_to
     AND status IN ('pending','accepted');
$$;

GRANT EXECUTE ON FUNCTION public.get_mentor_busy_slots(uuid, date, date) TO authenticated;

-- ============ C3: prevent duplicate open-ended room allocations ============
CREATE UNIQUE INDEX IF NOT EXISTS ux_room_allocations_active_room
  ON public.room_allocations (room_id)
  WHERE end_date IS NULL;

-- ============ C3: block double-convert of a funnel lead ============
CREATE OR REPLACE FUNCTION public.prevent_double_convert_funnel_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.linked_workspace_id IS NOT NULL
     AND OLD.linked_workspace_id IS NOT NULL
     AND NEW.linked_workspace_id IS DISTINCT FROM OLD.linked_workspace_id THEN
    RAISE EXCEPTION 'Este lead já foi convertido num workspace (%). Não pode ser convertido novamente.', OLD.linked_workspace_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_double_convert_funnel_item ON public.funnel_items;
CREATE TRIGGER trg_prevent_double_convert_funnel_item
BEFORE UPDATE ON public.funnel_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_double_convert_funnel_item();
