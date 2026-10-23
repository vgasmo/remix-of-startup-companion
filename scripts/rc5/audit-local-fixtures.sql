-- Disposable harness only: this Cloud table is absent from legacy migration replay.
-- Mirrors only the columns and old policy required by the audit migration tests.
CREATE TABLE public.playbook_template_assignments (
  id uuid DEFAULT gen_random_uuid(), playbook_id uuid, template_id uuid
);
ALTER TABLE public.playbook_template_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view template assignments"
  ON public.playbook_template_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can manage template assignments"
  ON public.playbook_template_assignments FOR ALL TO authenticated USING (public.is_staff());