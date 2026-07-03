
-- Harden reconnect trigger: use ON CONFLICT DO NOTHING (defense in depth alongside
-- the pre-existing unique indexes on (mentor_id, workspace_id) and
-- (founder_id, mentor_id)), so rapid-fire booking updates never race in duplicates.
CREATE OR REPLACE FUNCTION public.auto_open_reconnect_on_dead_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('declined','cancelled') THEN RETURN NEW; END IF;
  IF NEW.workspace_id IS NULL OR NEW.mentor_id IS NULL OR NEW.founder_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.mentor_connections
       WHERE mentor_id = NEW.mentor_id
         AND (workspace_id = NEW.workspace_id OR founder_id = NEW.founder_id)
    ) THEN
      INSERT INTO public.mentor_connections
        (founder_id, workspace_id, mentor_id, status, message)
      VALUES
        (NEW.founder_id, NEW.workspace_id, NEW.mentor_id, 'pending',
         'Sessão anterior não realizada — pedido de reconexão automático.')
      ON CONFLICT DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- Extend the notify trigger: when the connection is resolved (accepted/declined),
-- mark the founder's previously-emitted "mentor_connection_pending" notification
-- for the same connection_id as read so their inbox unread count settles.
CREATE OR REPLACE FUNCTION public.notify_mentor_connection_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_founder_user uuid;
  v_workspace_name text;
  v_mentor_name text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      SELECT s.name INTO v_workspace_name
        FROM public.workspaces w
        LEFT JOIN public.startups s ON s.id = w.startup_id
       WHERE w.id = NEW.workspace_id;

      SELECT COALESCE(full_name, email) INTO v_mentor_name
        FROM public.profiles WHERE id = NEW.mentor_id;

      INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
      VALUES (
        NEW.mentor_id,
        'mentor_connection_requested',
        'Novo pedido de ligação',
        COALESCE('Novo pedido de ligação de ' || v_workspace_name, 'Novo pedido de ligação'),
        '/mentors?tab=requests',
        jsonb_build_object('connection_id', NEW.id, 'workspace_id', NEW.workspace_id)
      );

      IF COALESCE(NEW.status, 'pending') = 'pending' THEN
        FOR v_founder_user IN
          SELECT wu.user_id FROM public.workspace_users wu
           WHERE wu.workspace_id = NEW.workspace_id
             AND wu.role = 'founder' AND wu.active = true
        LOOP
          INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
          VALUES (
            v_founder_user,
            'mentor_connection_pending',
            'Pedido de ligação pendente',
            COALESCE('O seu pedido a ' || v_mentor_name || ' está pendente de resposta.',
                     'O seu pedido de ligação está pendente de resposta.'),
            '/mentors?tab=connections',
            jsonb_build_object('connection_id', NEW.id, 'mentor_id', NEW.mentor_id, 'workspace_id', NEW.workspace_id)
          );
        END LOOP;
      END IF;

    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('accepted','declined') THEN
      -- Mark any founder-side "pending" notifications for this connection as read.
      UPDATE public.notifications
         SET read = true
       WHERE type = 'mentor_connection_pending'
         AND read = false
         AND (metadata ->> 'connection_id') = NEW.id::text;

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
