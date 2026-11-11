-- RC13 P00 · ONB-02 (resíduo): conta suspensa deixa de ler e escrever ficheiros no Storage.
-- Mesma política restritiva que a RC12 pôs nas 204 tabelas public. Não mexe em storage.buckets. Idempotente.
DROP POLICY IF EXISTS rc12_suspended_block ON storage.objects;
CREATE POLICY rc12_suspended_block ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_not_suspended((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.account_not_suspended((SELECT auth.uid()))));
