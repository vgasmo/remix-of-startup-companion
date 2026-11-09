CREATE OR REPLACE FUNCTION public.promote_funnel_item_to_operational()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
 IF NEW.type='lead' AND NEW.linked_workspace_id IS NOT NULL AND NEW.stage IN ('contracted','incubating','accelerating') THEN
 NEW.type:='startup_active'; NEW.converted_at:=COALESCE(NEW.converted_at,now());
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_promote_funnel_item_to_operational ON public.funnel_items;
CREATE TRIGGER trg_promote_funnel_item_to_operational BEFORE INSERT OR UPDATE OF stage,linked_workspace_id,type ON public.funnel_items FOR EACH ROW EXECUTE FUNCTION public.promote_funnel_item_to_operational();