-- Disposable fixture database only; never run against hosted data.
BEGIN;
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000001','approved');
INSERT INTO public.programs VALUES ('00000000-0000-0000-0000-000000000002',true);
INSERT INTO public.funnel_items(id,stage,type,organization_name,contact_name,notes,metadata_json)
VALUES ('00000000-0000-0000-0000-000000000003','new','lead','External contract lead','Contact','Original notes','{"project_name":"Project preserved","sector":"Technology","custom_data":"retained"}');
INSERT INTO public.communication_log(funnel_item_id,body)
VALUES ('00000000-0000-0000-0000-000000000003','Existing CRM meeting');
DO $$
DECLARE r jsonb; r2 jsonb; w uuid;
BEGIN
  BEGIN
    PERFORM public.staff_mark_funnel_item_contracted('00000000-0000-0000-0000-000000000003',NULL);
    RAISE EXCEPTION 'Missing program unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  IF (SELECT stage FROM public.funnel_items LIMIT 1) <> 'new' THEN RAISE EXCEPTION 'Failed conversion changed commercial stage'; END IF;
  r := public.staff_mark_funnel_item_contracted('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','growth');
  w := (r->>'workspace_id')::uuid;
  IF (SELECT status FROM public.workspaces WHERE id=w) <> 'pending' THEN RAISE EXCEPTION 'Unsigned workspace activated'; END IF;
  IF (SELECT stage FROM public.funnel_items LIMIT 1) <> 'contracted' THEN RAISE EXCEPTION 'Contracted stage lost'; END IF;
  IF (SELECT name FROM public.startups LIMIT 1) <> 'Project preserved' THEN RAISE EXCEPTION 'Project name lost'; END IF;
  IF (SELECT description FROM public.startups LIMIT 1) NOT LIKE '%Original notes%' THEN RAISE EXCEPTION 'Notes lost'; END IF;
  IF (SELECT metadata_json->>'custom_data' FROM public.funnel_items LIMIT 1) <> 'retained' THEN RAISE EXCEPTION 'Metadata lost'; END IF;
  IF (SELECT workspace_id FROM public.communication_log LIMIT 1) IS DISTINCT FROM w THEN RAISE EXCEPTION 'History not linked'; END IF;
  r2 := public.staff_mark_funnel_item_contracted('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','growth');
  IF r2->>'workspace_id' <> r->>'workspace_id' OR (SELECT count(*) FROM public.workspaces) <> 1 THEN RAISE EXCEPTION 'Duplicate workspace created'; END IF;
  IF (SELECT count(*) FROM public.communication_log) <> 1 THEN RAISE EXCEPTION 'Duplicate history created'; END IF;
  UPDATE public.profiles SET account_status='suspended';
  BEGIN
    PERFORM public.staff_mark_funnel_item_contracted('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'Suspended caller accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
ROLLBACK;