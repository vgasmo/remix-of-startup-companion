-- Allow workspace members to insert notifications targeted at other members
-- of the same active workspace. This is required so founders can notify
-- consultores/mentores about session/playbook/action events without needing
-- staff privileges, while still preventing arbitrary cross-user spam.

CREATE OR REPLACE FUNCTION public.can_notify_user(_target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_users wu_self
    JOIN public.workspace_users wu_target
      ON wu_target.workspace_id = wu_self.workspace_id
    WHERE wu_self.user_id = auth.uid()
      AND wu_self.active = true
      AND wu_target.user_id = _target_user
      AND wu_target.active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_notify_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "Members can notify workspace peers" ON public.notifications;
CREATE POLICY "Members can notify workspace peers"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (public.can_notify_user(user_id));
