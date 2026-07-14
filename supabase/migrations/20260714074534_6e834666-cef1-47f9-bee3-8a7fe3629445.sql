-- Extend scope to include workspace
ALTER TABLE public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_scope_check;
ALTER TABLE public.feature_flags
  ADD CONSTRAINT feature_flags_scope_check
  CHECK (scope IN ('global', 'program', 'workspace'));

-- Add workspace_id (nullable; only populated when scope = 'workspace')
ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Drop the old unique(key) and add scope-aware partial uniqueness
ALTER TABLE public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_global_key_uidx
  ON public.feature_flags (key)
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_program_key_uidx
  ON public.feature_flags (key, program_id)
  WHERE scope = 'program';

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_workspace_key_uidx
  ON public.feature_flags (key, workspace_id)
  WHERE scope = 'workspace';

-- Consistency: workspace scope must carry workspace_id; program scope must carry program_id.
ALTER TABLE public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_scope_link_chk;
ALTER TABLE public.feature_flags
  ADD CONSTRAINT feature_flags_scope_link_chk CHECK (
    (scope = 'global' AND program_id IS NULL AND workspace_id IS NULL)
    OR (scope = 'program' AND program_id IS NOT NULL AND workspace_id IS NULL)
    OR (scope = 'workspace' AND workspace_id IS NOT NULL AND program_id IS NULL)
  );

-- Members of a workspace can read the flags scoped to their workspace.
DROP POLICY IF EXISTS "Members can read workspace flags" ON public.feature_flags;
CREATE POLICY "Members can read workspace flags"
  ON public.feature_flags
  FOR SELECT
  USING (
    scope = 'workspace'
    AND workspace_id IN (
      SELECT wu.workspace_id FROM public.workspace_users wu
      WHERE wu.user_id = auth.uid() AND wu.active = true
    )
  );