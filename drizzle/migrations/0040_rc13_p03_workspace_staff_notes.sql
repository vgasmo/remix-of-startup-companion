-- RC13 P03 · FEF-04 · as notas internas do staff (saúde e prioridade) saem de workspaces, que o founder lê,
-- para uma tabela que só o staff lê. Idempotente. Não redefine nenhuma função existente (sem guardas md5).

-- ═══ 1. Tabela só de staff ═══
CREATE TABLE IF NOT EXISTS public.workspace_staff_notes (
  workspace_id   uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  health_notes   text,
  priority_notes text,
  updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.workspace_staff_notes FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.workspace_staff_notes TO authenticated;
GRANT ALL ON public.workspace_staff_notes TO service_role;
ALTER TABLE public.workspace_staff_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read workspace staff notes" ON public.workspace_staff_notes;
CREATE POLICY "Staff read workspace staff notes" ON public.workspace_staff_notes
  FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_backoffice());

DROP POLICY IF EXISTS "Staff insert workspace staff notes" ON public.workspace_staff_notes;
CREATE POLICY "Staff insert workspace staff notes" ON public.workspace_staff_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff update workspace staff notes" ON public.workspace_staff_notes;
CREATE POLICY "Staff update workspace staff notes" ON public.workspace_staff_notes
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- mesma política restritiva de suspensão que as outras tabelas com RLS (RC12)
DROP POLICY IF EXISTS rc12_suspended_block ON public.workspace_staff_notes;
CREATE POLICY rc12_suspended_block ON public.workspace_staff_notes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_not_suspended((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.account_not_suspended((SELECT auth.uid()))));

-- ═══ 2. Qualquer escrita das notas em workspaces é desviada para a tabela nova ═══
-- Cobre o cliente antigo enquanto não for publicado, as RPCs de conversão de leads e a função bulk-create-workspaces,
-- sem redefinir nenhuma delas. O trigger corre DEPOIS da escrita (a linha do workspace já existe), copia as notas
-- e limpa as colunas na mesma transação: quando a transação fecha, as colunas de workspaces estão sempre a NULL.
CREATE OR REPLACE FUNCTION public.redirect_workspace_staff_notes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.health_notes IS NOT NULL OR NEW.priority_notes IS NOT NULL THEN
    INSERT INTO public.workspace_staff_notes AS n (workspace_id, health_notes, priority_notes, updated_by, updated_at)
    VALUES (NEW.id, NEW.health_notes, NEW.priority_notes, auth.uid(), now())
    ON CONFLICT (workspace_id) DO UPDATE SET
      health_notes   = COALESCE(EXCLUDED.health_notes, n.health_notes),
      priority_notes = COALESCE(EXCLUDED.priority_notes, n.priority_notes),
      updated_by     = EXCLUDED.updated_by,
      updated_at     = now();
    -- esta segunda escrita volta a disparar o trigger, mas já com as duas colunas a NULL, e por isso para aqui
    UPDATE public.workspaces SET health_notes = NULL, priority_notes = NULL WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.redirect_workspace_staff_notes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_redirect_workspace_staff_notes ON public.workspaces;
CREATE TRIGGER trg_redirect_workspace_staff_notes
  AFTER INSERT OR UPDATE OF health_notes, priority_notes ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.redirect_workspace_staff_notes();

-- ═══ 3. Notas já existentes: o próprio trigger as move e deixa as colunas a NULL ═══
UPDATE public.workspaces
   SET health_notes = health_notes, priority_notes = priority_notes
 WHERE health_notes IS NOT NULL OR priority_notes IS NOT NULL;

-- ═══ 4. O registo de atividade, que o founder lê, guardava o texto da nota de prioridade ═══
UPDATE public.activity_log
   SET metadata = metadata - 'notes'
 WHERE action = 'priority_changed' AND metadata ? 'notes';
