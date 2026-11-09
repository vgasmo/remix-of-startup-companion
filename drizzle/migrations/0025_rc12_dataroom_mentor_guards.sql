CREATE OR REPLACE FUNCTION public.dataroom_items_same_workspace_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ws uuid;
BEGIN
 SELECT workspace_id INTO v_ws FROM public.datarooms WHERE id = NEW.dataroom_id;
 IF NEW.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = NEW.document_id AND d.workspace_id = v_ws) THEN RAISE EXCEPTION 'dataroom item document must belong to the dataroom workspace' USING ERRCODE='23514'; END IF;
 IF NEW.investor_update_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.investor_updates u WHERE u.id = NEW.investor_update_id AND u.workspace_id = v_ws) THEN RAISE EXCEPTION 'dataroom item investor update must belong to the dataroom workspace' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dataroom_items_same_workspace_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_dataroom_items_same_workspace ON public.dataroom_items;
CREATE TRIGGER trg_dataroom_items_same_workspace BEFORE INSERT OR UPDATE OF dataroom_id, document_id, investor_update_id ON public.dataroom_items FOR EACH ROW EXECUTE FUNCTION public.dataroom_items_same_workspace_guard();
DROP POLICY IF EXISTS "Mentors insert own shared notes" ON public.consultant_notes;
CREATE POLICY "Mentors insert own shared notes" ON public.consultant_notes FOR INSERT TO authenticated WITH CHECK (author_id=auth.uid() AND public.has_role(auth.uid(),'mentor_externo'::public.app_role) AND is_private=false AND visibility='shared_with_mentor' AND public.has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Mentors read own notes" ON public.consultant_notes;
CREATE POLICY "Mentors read own notes" ON public.consultant_notes FOR SELECT TO authenticated USING (author_id=auth.uid() AND public.has_role(auth.uid(),'mentor_externo'::public.app_role) AND public.has_workspace_access(workspace_id));