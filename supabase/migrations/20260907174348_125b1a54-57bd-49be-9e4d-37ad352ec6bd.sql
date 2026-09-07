-- P0.1 — serialize_program_tree must not be callable with the anon/authenticated keys.
REVOKE ALL ON FUNCTION public.serialize_program_tree(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.serialize_program_tree(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.serialize_program_tree(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.serialize_program_tree(uuid) TO service_role;

-- P0.2 — action items may only reference milestones inside their own workspace.
ALTER TABLE public.milestones
  ADD CONSTRAINT milestones_id_workspace_uk UNIQUE (id, workspace_id);

ALTER TABLE public.action_items DROP CONSTRAINT IF EXISTS action_items_milestone_id_fkey;

ALTER TABLE public.action_items
  ADD CONSTRAINT action_items_milestone_ws_fkey
  FOREIGN KEY (milestone_id, workspace_id)
  REFERENCES public.milestones (id, workspace_id) ON DELETE CASCADE;