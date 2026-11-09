DO $guard$
DECLARE v_def text; v_md5 text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='ensure_contract_workspace' AND pg_get_function_identity_arguments(p.oid)='p_contract_id uuid';
 v_md5:=md5(v_def);
 IF v_md5 NOT IN ('2d3a921ed8596956b790b9ee11b157f8','1e463f2616dddb34e65f929b4f6226bf') THEN RAISE EXCEPTION 'rc12: definição de public.ensure_contract_workspace divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',v_md5; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.ensure_contract_workspace(p_contract_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
 v_c public.startup_contracts%ROWTYPE; v_i public.contract_intakes%ROWTYPE; v_f public.funnel_items%ROWTYPE;
 v_prog uuid; v_startup uuid; v_ws uuid; v_owner uuid; v_nif text;
BEGIN
 IF NOT (public.is_staff() OR public.is_backoffice() OR coalesce(auth.role(),'')='service_role') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_c FROM public.startup_contracts WHERE id=p_contract_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found' USING ERRCODE='P0002'; END IF;
 IF v_c.workspace_id IS NOT NULL THEN RETURN v_c.workspace_id; END IF;
 SELECT * INTO v_i FROM public.contract_intakes WHERE contract_id=p_contract_id ORDER BY created_at DESC LIMIT 1;
 IF COALESCE(v_c.funnel_item_id,v_i.funnel_item_id) IS NOT NULL THEN SELECT * INTO v_f FROM public.funnel_items WHERE id=COALESCE(v_c.funnel_item_id,v_i.funnel_item_id) FOR UPDATE; END IF;
 IF v_f.linked_workspace_id IS NOT NULL THEN v_ws:=v_f.linked_workspace_id;
 ELSE
 -- rc12_reuse_imported: uma startup importada (PHC/HubSpot) ainda por reclamar, com o mesmo NIF, é reutilizada em vez de duplicada
 v_nif:=NULLIF(regexp_replace(COALESCE(v_c.company_nif,v_i.company_nif,''),'\D','','g'),'');
 IF v_nif IS NOT NULL AND (SELECT count(*) FROM public.workspaces w JOIN public.startups s ON s.id=w.startup_id WHERE w.status='imported_unclaimed' AND w.archived_at IS NULL AND regexp_replace(COALESCE(s.nif,''),'\D','','g')=v_nif)=1 THEN
 SELECT w.id,w.startup_id INTO v_ws,v_startup FROM public.workspaces w JOIN public.startups s ON s.id=w.startup_id WHERE w.status='imported_unclaimed' AND w.archived_at IS NULL AND regexp_replace(COALESCE(s.nif,''),'\D','','g')=v_nif;
 IF v_f.id IS NOT NULL THEN UPDATE public.funnel_items SET linked_workspace_id=v_ws,linked_startup_id=v_startup,updated_at=now() WHERE id=v_f.id; END IF;
 ELSE
 v_prog:=v_f.program_id;
 IF v_prog IS NULL THEN SELECT CASE WHEN count(*)=1 THEN (array_agg(id))[1] END INTO v_prog FROM public.programs WHERE is_active; END IF;
 IF v_prog IS NULL THEN RAISE EXCEPTION 'auto_mint_no_program: associe a lead a um programa e volte a sincronizar' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.startups(name,nif,address,website,description,main_contact_name,main_contact_email,main_contact_phone) VALUES (
 COALESCE(NULLIF(btrim(COALESCE(v_c.organization_name,v_i.organization_name,v_f.organization_name,'')),''),'Startup'),
 COALESCE(v_c.company_nif,v_i.company_nif),
 NULLIF(concat_ws(', ',COALESCE(v_c.company_address,v_i.company_address),COALESCE(v_c.company_postal_code,v_i.company_postal_code),COALESCE(v_c.company_city,v_i.company_city)),''),
 CASE WHEN v_i.website ~* '^https?://' THEN v_i.website END,v_i.startup_description,
 COALESCE(v_c.legal_representative_name,v_i.legal_representative_name,v_f.contact_name),COALESCE(v_c.legal_representative_email,v_i.legal_representative_email,v_f.contact_email),COALESCE(v_c.legal_representative_phone,v_i.legal_representative_phone,v_f.contact_phone)) RETURNING id INTO v_startup;
 IF v_f.owner_consultant_id IS NOT NULL AND (public.has_role(v_f.owner_consultant_id,'consultor'::public.app_role) OR public.has_role(v_f.owner_consultant_id,'admin'::public.app_role)) THEN v_owner:=v_f.owner_consultant_id; END IF;
 INSERT INTO public.workspaces(startup_id,program_id,status,needs_onboarding,assigned_consultor_id,created_by) VALUES(v_startup,v_prog,'pending',true,v_owner,auth.uid()) RETURNING id INTO v_ws;
 IF v_f.id IS NOT NULL THEN UPDATE public.funnel_items SET linked_workspace_id=v_ws,linked_startup_id=v_startup,updated_at=now() WHERE id=v_f.id; END IF;
 END IF;
 END IF;
 UPDATE public.startup_contracts SET workspace_id=v_ws,updated_at=now() WHERE id=p_contract_id;
 RETURN v_ws;
END; $function$;