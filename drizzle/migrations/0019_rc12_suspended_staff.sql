-- RC12 (sql_sec) · ONB-02 · conta suspensa deixa de ter poderes de staff (completa a RC11 B1).
-- Idempotente. Aplicar com pouco tráfego: o bloco final cria uma política em cada tabela com RLS (ACCESS EXCLUSIVE por tabela).
-- Tabelas criadas DEPOIS desta migração precisam da mesma política rc12_suspended_block (repetir o último bloco DO).
-- ═══ ONB-02 · conta suspensa sem poderes de staff (completa a RC11 B1) ═══
-- Partimos da definição da base viva (drizzle incluído). has_role NÃO chama account_not_suspended: na base viva essa função
-- devolve false quando auth.uid() é NULL e o papel não é service_role (cron, postgres, triggers sem JWT), o que anularia
-- admins ativos fora de um pedido autenticado. A consulta direta a profiles não depende do contexto do pedido.
DO $guard$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5 FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace AND p.proname='has_role' AND pg_get_function_identity_arguments(p.oid)='_user_id uuid, _role app_role';
  IF v_md5 NOT IN ('829ccf3e06cda2c8e722d400fbc7fc41', 'ef25422c4c8524dba6f9cfeb797b5b51') THEN
    RAISE EXCEPTION 'rc12: definição de public.has_role divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar', v_md5;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN coalesce(current_setting('request.jwt.claim.role', true),
                  NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'anon' THEN false
    -- RC12: os papéis de staff deixam de valer numa conta suspensa
    WHEN _role IN ('admin'::public.app_role, 'consultor'::public.app_role, 'backoffice'::public.app_role)
         AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.account_status = 'suspended') THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END
$function$;

-- block_workspace (SECURITY DEFINER) lê user_roles cru: um admin suspenso ainda bloqueava workspaces
DO $$
DECLARE d text; v_md5 text;
BEGIN
  d := pg_get_functiondef('public.block_workspace(uuid,text)'::regprocedure);
  v_md5 := md5(d);
  IF position('RC12 suspensa' IN d) > 0 THEN RETURN; END IF;  -- já aplicado
  IF v_md5 <> '54d27d85528e047a0490c50515a50300' THEN
    RAISE EXCEPTION 'rc12: definição de public.block_workspace divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar', v_md5;
  END IF;
  d := replace(d, $q$  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'admin') THEN$q$,
$q$  IF NOT public.has_role(_user_id, 'admin'::public.app_role) THEN  -- RC12 suspensa$q$);
  EXECUTE d;
END $$;

-- unblock_workspace (SECURITY DEFINER) tem o mesmo defeito: um admin suspenso ainda desbloqueava workspaces bloqueados
DO $$
DECLARE d text; v_md5 text;
BEGIN
  d := pg_get_functiondef('public.unblock_workspace(uuid)'::regprocedure);
  v_md5 := md5(d);
  IF position('RC12 suspensa' IN d) > 0 THEN RETURN; END IF;  -- já aplicado
  IF v_md5 <> 'b993c1e432d9ea7a40956a494f6440d7' THEN
    RAISE EXCEPTION 'rc12: definição de public.unblock_workspace divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar', v_md5;
  END IF;
  d := replace(d, $q$  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'admin') THEN$q$,
$q$  IF NOT public.has_role(_user_id, 'admin'::public.app_role) THEN  -- RC12 suspensa$q$);
  EXECUTE d;
END $$;

-- política RESTRICTIVE em todas as tabelas com RLS (exceto profiles e user_roles, que o cliente lê para mostrar /suspended)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relrowsecurity
       AND c.relname NOT IN ('profiles', 'user_roles')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rc12_suspended_block', r.relname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.account_not_suspended((SELECT auth.uid())))) '
      'WITH CHECK ((SELECT public.account_not_suspended((SELECT auth.uid()))))',
      'rc12_suspended_block', r.relname);
  END LOOP;
END $$;
