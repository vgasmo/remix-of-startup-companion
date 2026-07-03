
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
      -- Remove any pending "pedido pendente" notifications for this connection
      -- so they vanish from every inbox view (read + unread filters).
      -- Also clean up the mentor's original "pedido de ligação" notification.
      DELETE FROM public.notifications
       WHERE type IN ('mentor_connection_pending', 'mentor_connection_requested')
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
