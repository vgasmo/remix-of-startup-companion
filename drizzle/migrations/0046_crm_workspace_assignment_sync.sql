CREATE OR REPLACE FUNCTION public.sync_crm_workspace_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.linked_workspace_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.owner_consultant_id IS DISTINCT FROM OLD.owner_consultant_id THEN
    UPDATE public.workspaces SET assigned_consultor_id = NEW.owner_consultant_id WHERE id = NEW.linked_workspace_id AND assigned_consultor_id IS DISTINCT FROM NEW.owner_consultant_id;
    IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = NEW.linked_workspace_id AND assigned_consultor_id IS NOT DISTINCT FROM NEW.owner_consultant_id) THEN
      RAISE EXCEPTION 'Workspace update not permitted' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.program_id IS DISTINCT FROM OLD.program_id THEN
    UPDATE public.workspaces SET program_id = NEW.program_id WHERE id = NEW.linked_workspace_id AND program_id IS DISTINCT FROM NEW.program_id;
    IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = NEW.linked_workspace_id AND program_id IS NOT DISTINCT FROM NEW.program_id) THEN
      RAISE EXCEPTION 'Workspace update not permitted' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_workspace_crm_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_consultor_id IS DISTINCT FROM OLD.assigned_consultor_id THEN
    UPDATE public.funnel_items SET owner_consultant_id = NEW.assigned_consultor_id WHERE linked_workspace_id = NEW.id AND owner_consultant_id IS DISTINCT FROM NEW.assigned_consultor_id;
  END IF;
  IF NEW.program_id IS DISTINCT FROM OLD.program_id THEN
    UPDATE public.funnel_items SET program_id = NEW.program_id WHERE linked_workspace_id = NEW.id AND program_id IS DISTINCT FROM NEW.program_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_crm_workspace_assignment(), public.sync_workspace_crm_assignment() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_crm_workspace_assignment(), public.sync_workspace_crm_assignment() TO authenticated, service_role;
CREATE OR REPLACE TRIGGER sync_crm_workspace_assignment AFTER UPDATE OF owner_consultant_id, program_id ON public.funnel_items FOR EACH ROW EXECUTE FUNCTION public.sync_crm_workspace_assignment();
CREATE OR REPLACE TRIGGER sync_workspace_crm_assignment AFTER UPDATE OF assigned_consultor_id, program_id ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.sync_workspace_crm_assignment();