-- RC12 (sql_sec) · FEB-01 / FES-08 / FEX-01 · URLs escritas por utilizadores nunca podem ter esquema executável (javascript:, data:, vbscript:, ...).
-- Cobre profiles.linkedin_url (FEB-01), documents.external_url (FES-08) e as restantes colunas de URL editáveis por utilizadores (FEX-01).
-- Regra: aceita NULL, http(s):// (com espaços iniciais) ou valores sem ':' (ex.: 'linkedin.com/in/x'); tudo o resto é rejeitado.
-- Idempotente. Primeiro anula os valores perigosos já guardados, depois cria o CHECK (NOT VALID: não revalida o histórico).
-- Efeito: valores existentes com outro esquema (mailto:, ftp:, tel:) ou com ':' sem http(s) são anulados; ver a consulta de leitura no prompt.
DO $$
DECLARE
  t record;
  chk text;
  newval text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('profiles','linkedin_url'),
      ('team_members','linkedin_url'),
      ('sessions','join_url'),
      ('sessions','teams_meeting_url'),
      ('action_deliverables','external_url'),
      ('documents','external_url'),
      ('program_weeks','meeting_url')
    ) AS v(tbl, col)
  LOOP
    chk := format('%s_%s_safe_scheme_chk', t.tbl, t.col);
    -- action_deliverables tem CHECK deliverable_has_source (file_path OR external_url OR document_id):
    -- se nao houver outra fonte, fica '' (nao NULL) para a migracao nao falhar; a UI esconde '' (d.external_url &&).
    newval := CASE WHEN t.tbl = 'action_deliverables'
                   THEN 'CASE WHEN file_path IS NOT NULL OR document_id IS NOT NULL THEN NULL ELSE '''' END'
                   ELSE 'NULL' END;
    EXECUTE format(
      'UPDATE public.%I SET %I = %s WHERE %I IS NOT NULL AND NOT (%I ~* ''^\s*https?://'' OR %I !~ '':'')',
      t.tbl, t.col, newval, t.col, t.col, t.col);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = chk AND conrelid = format('public.%I', t.tbl)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I ~* ''^\s*https?://'' OR %I !~ '':'') NOT VALID',
        t.tbl, chk, t.col, t.col, t.col);
    END IF;
  END LOOP;
END $$;
