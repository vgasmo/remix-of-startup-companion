-- RC12 (sql_db) · DBP-01, DBP-02, DBP-03, SCH-01, SCH-13
-- `.upsert(..., { onConflict: 'a,b' })` do supabase-js e o `ON CONFLICT (a, b)` sem predicado das funcoes SQL
-- so aceitam como arbitro um indice UNIQUE completo. Tres indices unicos eram parciais (WHERE ... IS NOT NULL) e
-- davam 42P10 ("there is no unique or exclusion constraint matching the ON CONFLICT specification"):
--   notifications (user_id, event_key)            -> upserts de notificacoes (sessoes, template_requests, playbook, templates)
--   stages (program_id, stage_key)                -> publish_program_setup com etapas
--   communication_log (external_source, external_id) -> sync-graph-email-history
-- Como os NULLs sao distintos num indice unico, o predicado "IS NOT NULL" nao acrescenta nada: o indice completo
-- impoe exatamente a mesma unicidade e passa a ser inferivel (com ou sem WHERE no ON CONFLICT).
-- Idempotente: so recria o indice se ainda for parcial. Os nomes mantem-se (testes e codigo dependem deles).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('notifications',     'notifications_event_key_user_unique',   'user_id, event_key'),
    ('stages',            'stages_program_stage_key_unique',       'program_id, stage_key'),
    ('communication_log', 'idx_communication_log_external_dedupe', 'external_source, external_id')
  ) AS v(tbl, idx, cols)
  LOOP
    IF to_regclass(format('public.%I', r.tbl)) IS NULL THEN CONTINUE; END IF;
    IF to_regclass(format('public.%I', r.idx)) IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM pg_index
                  WHERE indexrelid = to_regclass(format('public.%I', r.idx))
                    AND indpred IS NULL AND indisunique AND indisvalid) THEN
        CONTINUE;  -- ja e completo
      END IF;
      EXECUTE format('DROP INDEX public.%I', r.idx);
    END IF;
    EXECUTE format('CREATE UNIQUE INDEX %I ON public.%I (%s)', r.idx, r.tbl, r.cols);
  END LOOP;
END $$;
