-- RC12 (sql_db) · DBP-04 — RLS: avaliar o acesso por conjunto (1x por consulta) em vez de uma funcao SECURITY DEFINER por linha.
-- has_workspace_access / can_write_workspace / is_founder / is_conversation_participant sao SQL STABLE SECURITY DEFINER
-- (nao inlinaveis): o Postgres chama-as uma vez por linha (~0,15 a 0,7 ms/linha; em 20k linhas 3 a 9 s).
-- Esta migracao (a) acrescenta helpers de conjunto equivalentes e (b) reescreve, nas politicas das 8 tabelas mais quentes,
-- as chamadas por linha para `col IN (SELECT helper())` / `(SELECT fn())` (InitPlan). Comportamento identico:
-- equivalencia verificada para 19 personas x 20 tabelas (leitura e escrita), incluindo contas pending/suspensas,
-- mentor com e sem NDA, workspace bloqueado, anon e service_role.
-- Nota: o ALTER POLICY pede ACCESS EXCLUSIVE nas tabelas durante a transacao; aplicar fora das horas de ponta.
-- Idempotente: a 2.a aplicacao nao altera nenhuma politica.

-- Guarda: aborta (em vez de pisar) se as funcoes de que os helpers dependem divergirem da definicao de que partimos.
DO $guard$
DECLARE r record; v_expected jsonb := '{
  "can_write_workspace(_workspace_id uuid)": "2d4228fe6c8662cf41a45b5fa1031c9d",
  "has_workspace_access(_workspace_id uuid)": "5f79d5f43dde0df140e34aa1d7235cf3",
  "is_founder(_workspace_id uuid)": "bd39034be5befffbf413c5da16d3c750",
  "is_admin()": "34c2c6de8c80c4b013fb02c8d797bf5f",
  "is_account_active()": "ce406d5946bdd3a6e7c5a6875575cd6b",
  "is_account_active(_user_id uuid)": "a5d7a21723d2e213432adb8b229311c5",
  "account_not_suspended(_user_id uuid)": "323d060dd1ca1c4c0c7ccf01d637e46d",
  "is_conversation_participant(_user_id uuid, _conversation_id uuid)": "2392f9e8d0dcb27b9fead7d3bf0d7a19",
  "has_accepted_nda(_user_id uuid, _nda_version text)": "665aee8fd8adc952d56b56227c7e729f"
}'::jsonb;
BEGIN
  FOR r IN SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig, md5(pg_get_functiondef(p.oid)) AS m
             FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
              AND p.proname IN ('can_write_workspace','has_workspace_access','is_founder','is_admin','is_account_active',
                                'account_not_suspended','is_conversation_participant','has_accepted_nda')
  LOOP
    IF v_expected ? r.sig AND v_expected->>r.sig <> r.m THEN
      RAISE EXCEPTION 'rc12: definicao de public.% divergente (md5 %), envie pg_get_functiondef antes de aplicar', r.sig, r.m;
    END IF;
  END LOOP;
END $guard$;

-- Helpers de conjunto (equivalentes exatos, repartidos em parte global + conjunto de workspaces do utilizador).
CREATE OR REPLACE FUNCTION public.has_global_workspace_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin()
      OR (public.account_not_suspended(auth.uid()) AND EXISTS (
            SELECT 1 FROM public.user_roles
             WHERE user_id = auth.uid() AND role = 'consultor'::public.app_role))
$$;

-- Parte global de can_write_workspace(uuid): exige conta aprovada (is_account_active(uuid)) tambem para admin/consultor.
CREATE OR REPLACE FUNCTION public.has_global_write_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_account_active(auth.uid())
     AND (public.is_admin()
          OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'consultor'::public.app_role))
$$;

CREATE OR REPLACE FUNCTION public.member_workspace_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT wu.workspace_id
    FROM public.workspace_users wu
    JOIN public.workspaces w ON w.id = wu.workspace_id
   WHERE wu.user_id = auth.uid()
     AND wu.active = true
     AND w.status <> 'blocked'
     AND w.blocked_at IS NULL
     AND public.is_account_active()
     AND (NOT EXISTS (SELECT 1 FROM public.user_roles
                       WHERE user_id = auth.uid() AND role = 'mentor_externo'::public.app_role)
          OR public.has_accepted_nda(auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.writer_workspace_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT wu.workspace_id
    FROM public.workspace_users wu
    JOIN public.workspaces w ON w.id = wu.workspace_id
   WHERE wu.user_id = auth.uid()
     AND wu.active = true
     AND wu.role IN ('founder'::public.app_role, 'consultor'::public.app_role)
     AND w.blocked_at IS NULL
     AND public.is_account_active(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.founder_workspace_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT wu.workspace_id
    FROM public.workspace_users wu
   WHERE wu.user_id = auth.uid()
     AND wu.active = true
     AND wu.role = 'founder'::public.app_role
$$;

CREATE OR REPLACE FUNCTION public.my_conversation_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT conversation_id FROM public.conversation_participants WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.has_global_workspace_access(), public.has_global_write_access(), public.member_workspace_ids(),
                       public.writer_workspace_ids(), public.founder_workspace_ids(), public.my_conversation_ids() FROM PUBLIC;
-- anon tem de poder executar: varias politicas sao "TO public" e o Postgres avalia-as tambem para anon (devolvem vazio/false).
GRANT EXECUTE ON FUNCTION public.has_global_workspace_access(), public.has_global_write_access(), public.member_workspace_ids(),
                          public.writer_workspace_ids(), public.founder_workspace_ids(), public.my_conversation_ids()
  TO anon, authenticated, service_role;

-- Reescrita das politicas das tabelas quentes (le pg_policy, por isso parte das politicas atuais; o que nao casar fica como esta).
DO $$
DECLARE
  v_tables text[] := ARRAY[
    'action_items','milestones','sessions','documents','kpi_values','notifications','messages','conversation_participants'
  ];
  v_old_path text := current_setting('search_path');
  p record;
  v_q text; v_nq text; v_nw text; v_sql text; v_n int := 0;
BEGIN
  PERFORM set_config('search_path', 'public, pg_catalog', true);   -- pg_get_expr devolve nomes sem prefixo
  FOR p IN
    SELECT pol.oid, pol.polname, pol.polrelid, c.relname,
           pg_get_expr(pol.polqual, pol.polrelid) AS q, pg_get_expr(pol.polwithcheck, pol.polrelid) AS w
      FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (v_tables)
  LOOP
    v_nq := p.q; v_nw := p.w;
    FOR i IN 1..2 LOOP
      v_q := CASE i WHEN 1 THEN v_nq ELSE v_nw END;
      IF v_q IS NULL THEN CONTINUE; END IF;
      -- 1) funcoes de pertenca por linha -> conjuntos
      v_q := regexp_replace(v_q, '(?<!SELECT )\yhas_workspace_access\(((?:[a-z_]+\.)?[a-z_]+)\)',
                            '((SELECT public.has_global_workspace_access()) OR \1 IN (SELECT public.member_workspace_ids()))', 'g');
      v_q := regexp_replace(v_q, '(?<!SELECT )\ycan_write_workspace\(((?:[a-z_]+\.)?[a-z_]+)\)',
                            '((SELECT public.has_global_write_access()) OR \1 IN (SELECT public.writer_workspace_ids()))', 'g');
      v_q := regexp_replace(v_q, '(?<!SELECT )\yis_founder\(((?:[a-z_]+\.)?[a-z_]+)\)',
                            '((SELECT public.is_admin()) OR \1 IN (SELECT public.founder_workspace_ids()))', 'g');
      v_q := regexp_replace(v_q, '(?<!SELECT )\yis_conversation_participant\(auth\.uid\(\), ((?:[a-z_]+\.)?[a-z_]+)\)',
                            '(\1 IN (SELECT public.my_conversation_ids()))', 'g');
      v_q := regexp_replace(v_q, '(?<!SELECT )\yis_conversation_participant\(\( SELECT auth\.uid\(\) AS uid\), ((?:[a-z_]+\.)?[a-z_]+)\)',
                            '(\1 IN (SELECT public.my_conversation_ids()))', 'g');
      -- 2) auth.uid()/auth.role() e helpers sem argumentos -> InitPlan
      v_q := regexp_replace(v_q, '(?<!SELECT )(?<![a-z_.])auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      v_q := regexp_replace(v_q, '(?<!SELECT )(?<![a-z_.])auth\.role\(\)', '(SELECT auth.role())', 'g');
      v_q := regexp_replace(v_q, '(?<!SELECT )(?<![a-z_.])(is_admin|is_staff|is_backoffice|can_access_backoffice|is_admin_only|is_founder_user)\(\)',
                            '(SELECT public.\1())', 'g');
      -- 3) has_role(<uid>, '<papel>'): argumentos constantes
      v_q := regexp_replace(v_q, '(?<!SELECT )(?<![a-z_.])has_role\(\( SELECT auth\.uid\(\) AS uid\), (''[a-z_]+''::app_role)\)',
                            '(SELECT public.has_role((SELECT auth.uid()), \1))', 'g');
      v_q := regexp_replace(v_q, '(?<!SELECT )(?<![a-z_.])has_role\(\(SELECT auth\.uid\(\)\), (''[a-z_]+''::app_role)\)',
                            '(SELECT public.has_role((SELECT auth.uid()), \1))', 'g');
      IF i = 1 THEN v_nq := v_q; ELSE v_nw := v_q; END IF;
    END LOOP;
    IF v_nq IS NOT DISTINCT FROM p.q AND v_nw IS NOT DISTINCT FROM p.w THEN CONTINUE; END IF;
    v_sql := format('ALTER POLICY %I ON public.%I', p.polname, p.relname)
          || CASE WHEN v_nq IS NOT NULL THEN ' USING (' || v_nq || ')' ELSE '' END
          || CASE WHEN v_nw IS NOT NULL THEN ' WITH CHECK (' || v_nw || ')' ELSE '' END;
    EXECUTE v_sql;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('search_path', v_old_path, true);
  RAISE NOTICE 'RC12 DBP-04: % politicas reescritas', v_n;
END $$;