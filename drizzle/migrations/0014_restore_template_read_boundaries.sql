ALTER POLICY "Authenticated users can read session_templates" ON public.session_templates USING (public.is_staff() OR is_global = true OR created_by = auth.uid());
ALTER POLICY "Authenticated users can read investor_update_templates" ON public.investor_update_templates USING (public.is_staff() OR is_active = true);
