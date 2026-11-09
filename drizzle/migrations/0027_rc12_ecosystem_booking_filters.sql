DO $guard$
DECLARE v_def text; v_md5 text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='commit_first_contact_booking_atomic' AND pg_get_function_identity_arguments(p.oid)='p_idempotency_key text, p_contact jsonb, p_slot jsonb, p_consultant_id uuid, p_program_id uuid, p_metadata jsonb, p_routing_decision jsonb';
 IF v_def IS NULL THEN RAISE EXCEPTION 'rc12: public.commit_first_contact_booking_atomic nao encontrada'; END IF;
 v_md5:=md5(v_def);
 IF v_md5 NOT IN ('6ec204b2c7fef82a9bbc1fe716cd6bc0','c27553ddbb52a4364aef11cc83844450') THEN RAISE EXCEPTION 'rc12: definição de public.commit_first_contact_booking_atomic divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',v_md5; END IF;
END $guard$;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.commit_first_contact_booking_atomic(text,jsonb,jsonb,uuid,uuid,jsonb,jsonb)'::regprocedure);
 IF position($q$WHERE lower(btrim(contact_email)) = v_email AND stage IN ('new','first_contact_booked')$q$ IN d)>0 THEN RETURN; END IF;
 IF position($q$WHERE contact_email = v_email AND stage IN ('new','first_contact_booked')$q$ IN d)=0 THEN RAISE EXCEPTION 'RC12: texto esperado nao encontrado em commit_first_contact_booking_atomic'; END IF;
 d:=replace(d,$q$WHERE contact_email = v_email AND stage IN ('new','first_contact_booked')$q$,$q$WHERE lower(btrim(contact_email)) = v_email AND stage IN ('new','first_contact_booked')$q$); EXECUTE d;
END $$;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='list_ecosystem_items_v2';
 IF d IS NULL THEN RAISE EXCEPTION 'rc12: list_ecosystem_items_v2 não encontrada'; END IF;
 IF md5(d) NOT IN ('58ef2b7a89bc03771e87a25820e40fdd','50d29a7ca12b4691b8ad1f28411c0454') THEN RAISE EXCEPTION 'rc12: definição de public.list_ecosystem_items_v2 divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',md5(d); END IF;
 IF position('AND p_health IS NULL AND (p_has_startup_portugal IS NOT TRUE)' IN d)>0 THEN RETURN; END IF;
 IF position('AND (p_has_startup_portugal IS NOT TRUE) AND p_incubation_type_id IS NULL' IN d)=0 THEN RAISE EXCEPTION 'rc12: list_ecosystem_items_v2: texto esperado do CTE fi não encontrado (definição divergente), envie o resultado de pg_get_functiondef antes de aplicar'; END IF;
 d:=replace(d,'AND (p_has_startup_portugal IS NOT TRUE) AND p_incubation_type_id IS NULL','AND p_health IS NULL AND (p_has_startup_portugal IS NOT TRUE) AND p_incubation_type_id IS NULL'); EXECUTE d;
END $$;