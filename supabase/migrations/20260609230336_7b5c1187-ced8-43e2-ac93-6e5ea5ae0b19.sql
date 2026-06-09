CREATE TABLE IF NOT EXISTS public.workspace_engagement_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view','comment','acknowledge','react','complete')),
  target_type TEXT NOT NULL CHECK (target_type IN ('action','milestone','kpi','session','document','checkin')),
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workspace_engagement_events IS 'GDPR-safe engagement signals. Stores only IDs/timestamps/enums — no PII (names/emails/bodies resolved client-side from existing member data).';

GRANT SELECT, INSERT ON public.workspace_engagement_events TO authenticated;
GRANT ALL ON public.workspace_engagement_events TO service_role;

ALTER TABLE public.workspace_engagement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members and staff can read engagement events"
  ON public.workspace_engagement_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_workspace_access(workspace_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'consultor'::app_role)
  );

CREATE POLICY "Authenticated users can insert their own engagement events"
  ON public.workspace_engagement_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND public.has_workspace_access(workspace_id, auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_engagement_ws_time
  ON public.workspace_engagement_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_target
  ON public.workspace_engagement_events(workspace_id, target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_actor
  ON public.workspace_engagement_events(actor_id, created_at DESC);
