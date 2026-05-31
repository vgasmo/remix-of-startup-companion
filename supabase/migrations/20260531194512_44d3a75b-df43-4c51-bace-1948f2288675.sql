ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_user_unique
  ON public.notifications (user_id, event_key)
  WHERE event_key IS NOT NULL;