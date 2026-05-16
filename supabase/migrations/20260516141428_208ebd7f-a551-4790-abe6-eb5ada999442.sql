
ALTER TABLE public.template_instances_dedup_backup_20260516 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read template_instances dedup backup"
ON public.template_instances_dedup_backup_20260516
FOR SELECT
TO authenticated
USING (public.is_admin());
