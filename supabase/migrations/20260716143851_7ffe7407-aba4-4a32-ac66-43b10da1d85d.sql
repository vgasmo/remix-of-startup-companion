
-- 1. workspace_invitations: keep the existing self-accept policy shape, add column-lock trigger
DROP POLICY IF EXISTS "Users can accept own invitations" ON public.workspace_invitations;

CREATE POLICY "Users can accept own invitations"
ON public.workspace_invitations
FOR UPDATE
TO authenticated
USING (
  email = ((SELECT users.email FROM auth.users WHERE users.id = auth.uid()))::text
  AND accepted_at IS NULL
)
WITH CHECK (
  email = ((SELECT users.email FROM auth.users WHERE users.id = auth.uid()))::text
);

CREATE OR REPLACE FUNCTION public.workspace_invitations_lock_columns_on_self_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND OLD.email = ((SELECT users.email FROM auth.users WHERE users.id = auth.uid()))::text
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'consultor') THEN
    IF NEW.workspace_id  IS DISTINCT FROM OLD.workspace_id
       OR NEW.role       IS DISTINCT FROM OLD.role
       OR NEW.email      IS DISTINCT FROM OLD.email
       OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
      RAISE EXCEPTION 'Invitees may only update accepted_at on their own invitation'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_invitations_lock_self_accept ON public.workspace_invitations;
CREATE TRIGGER trg_workspace_invitations_lock_self_accept
BEFORE UPDATE ON public.workspace_invitations
FOR EACH ROW
EXECUTE FUNCTION public.workspace_invitations_lock_columns_on_self_accept();

-- 2. admin_announcements: keep founder mark-as-read policy, add column-lock trigger
DROP POLICY IF EXISTS "Founders mark as read" ON public.admin_announcements;

CREATE POLICY "Founders mark as read"
ON public.admin_announcements
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_users
    WHERE workspace_users.workspace_id = admin_announcements.workspace_id
      AND workspace_users.user_id = auth.uid()
      AND workspace_users.role = 'founder'::app_role
      AND workspace_users.active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_users
    WHERE workspace_users.workspace_id = admin_announcements.workspace_id
      AND workspace_users.user_id = auth.uid()
      AND workspace_users.role = 'founder'::app_role
      AND workspace_users.active = true
  )
);

CREATE OR REPLACE FUNCTION public.admin_announcements_lock_founder_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'consultor') THEN
    IF NEW.title           IS DISTINCT FROM OLD.title
       OR NEW.message      IS DISTINCT FROM OLD.message
       OR NEW.category     IS DISTINCT FROM OLD.category
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.created_by   IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Founders may only mark announcements as read (is_read/read_at)'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_announcements_lock_founder_cols ON public.admin_announcements;
CREATE TRIGGER trg_admin_announcements_lock_founder_cols
BEFORE UPDATE ON public.admin_announcements
FOR EACH ROW
EXECUTE FUNCTION public.admin_announcements_lock_founder_columns();
