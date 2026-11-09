-- RC12 (sql_sec) · FEF-11 · block_founder_notifications passa a usar o mesmo critério de founder_notifications_blocked (RC11 D.9):
-- membros ativos de um workspace (founder/team_member) sem papel global também deixam de receber notificações in-app com o
-- interruptor notifications.founders_disabled ligado. Staff e mentores continuam isentos (a isenção está no helper).
-- Parte da definição VIVA (md5 ee55a0328c8307152cee258b300cb554); aborta se tiver divergido. Idempotente.
DO $guard$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5 FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'block_founder_notifications' AND pg_get_function_identity_arguments(p.oid) = '';
  IF v_md5 NOT IN ('ee55a0328c8307152cee258b300cb554', '3d565dcd55e46fd58c1beb634bc2e7e7') THEN
    RAISE EXCEPTION 'rc12: definição de public.block_founder_notifications divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar', v_md5;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.block_founder_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.founder_notifications_blocked(NEW.user_id) THEN
    RETURN NULL; -- descartar em silêncio
  END IF;
  RETURN NEW;
END;
$function$;