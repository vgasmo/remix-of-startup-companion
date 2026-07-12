-- Fix PRIVILEGE_ESCALATION_RISK: founders could self-insert into ANY pending workspace
-- Root cause: no ownership marker on pending workspaces; the workspace_users INSERT
-- policy only checked workspace.status='pending'. Fix by tracking creator and
-- restricting self-insert to workspaces the caller created AND that have no
-- existing members yet (defence-in-depth).

-- 1. Track workspace creator
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Backfill created_by from the earliest founder membership per workspace
UPDATE public.workspaces w
SET created_by = sub.user_id
FROM (
  SELECT DISTINCT ON (workspace_id) workspace_id, user_id
  FROM public.workspace_users
  WHERE role = 'founder' AND active = true
  ORDER BY workspace_id, created_at ASC
) sub
WHERE w.id = sub.workspace_id AND w.created_by IS NULL;

-- 2. Tighten workspaces INSERT policy — must stamp created_by = auth.uid()
DROP POLICY IF EXISTS "Founders can create pending workspaces" ON public.workspaces;
CREATE POLICY "Founders can create pending workspaces"
ON public.workspaces
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'pending'
  AND created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'founder'
  )
);

-- 3. Tighten workspace_users self-insert: only for pending workspaces the caller
--    created, and only when no other members exist yet (blocks join-any-pending).
DROP POLICY IF EXISTS "Founders can add themselves to pending workspaces" ON public.workspace_users;
CREATE POLICY "Founders can add themselves to pending workspaces"
ON public.workspace_users
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'founder'
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_id
      AND w.status = 'pending'
      AND w.created_by = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_users existing
    WHERE existing.workspace_id = workspace_users.workspace_id
  )
);