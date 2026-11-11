-- RC13 P01 · papel de staff só vale com a conta aprovada (fecha o "staff bypass" das contas pendentes).
-- Idempotente. Redefine 3 funções; cada uma tem guarda md5 e a migração aborta se a definição real divergir.
-- Os md5 de partida foram lidos na base real a 11 nov 2026 e são iguais aos da réplica.

-- ═══ 1. account_not_suspended: passa a devolver false também para conta PENDENTE com papel de staff ═══
-- É o ponto único por onde passam is_staff(), is_admin(), is_backoffice(), can_access_backoffice(),
-- has_global_workspace_access(), has_workspace_access() e a política restritiva rc12_suspended_block
-- das 204 tabelas e do Storage. Um founder pendente (sem papel de staff) fica exatamente como estava.
DO $guard$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5 FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'account_not_suspended'
     AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid';
  IF v_md5 NOT IN ('323d060dd1ca1c4c0c7ccf01d637e46d', '6c3662bf5951e114ab227c55c184b98a') THEN
    RAISE EXCEPTION 'rc13: definição de public.account_not_suspended divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar', v_md5;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.account_not_suspended(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT CASE WHEN auth.role() = 'anon' OR (auth.uid() IS NULL AND auth.role() IS DISTINCT FROM 'service_role') THEN false ELSE _user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND (p.account_status = 'suspended' OR (p.account_status = 'pending' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('admin'::public.app_role, 'consultor'::public.app_role, 'backoffice'::public.app_role))))) END; $function$;

-- ═══ 2. has_role: os papéis de staff deixam de valer numa conta suspensa OU pendente ═══
DO $guard$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5 FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'has_role'
     AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid, _role app_role';
  IF v_md5 NOT IN ('ef25422c4c8524dba6f9cfeb797b5b51', '6931c65a2398d7b0f955065b117f182e') THEN
    RAISE EXCEPTION 'rc13: definição de public.has_role divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar', v_md5;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN coalesce(current_setting('request.jwt.claim.role', true),
                  NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'anon' THEN false
    -- RC12 + RC13: os papéis de staff só valem numa conta que não esteja suspensa nem pendente
    WHEN _role IN ('admin'::public.app_role, 'consultor'::public.app_role, 'backoffice'::public.app_role)
         AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.account_status IN ('suspended', 'pending')) THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END
$function$;

-- ═══ 3. is_account_active(): sai o "staff bypass"; ativa é só a conta aprovada ═══
DO $guard$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5 FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'is_account_active'
     AND pg_get_function_identity_arguments(p.oid) = '';
  IF v_md5 NOT IN ('ce406d5946bdd3a6e7c5a6875575cd6b', '41943a545b2e4b269b54a49dacc10113') THEN
    RAISE EXCEPTION 'rc13: definição de public.is_account_active() divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar', v_md5;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.is_account_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND account_status = 'approved'
  );
$function$;
