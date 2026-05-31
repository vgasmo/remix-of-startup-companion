-- Add performance index for notification listing queries ordered by created_at
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON public.notifications (user_id, created_at DESC);