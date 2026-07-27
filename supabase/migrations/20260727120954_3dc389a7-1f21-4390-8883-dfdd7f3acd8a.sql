CREATE TABLE IF NOT EXISTS public.program_publish_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  snapshot_json jsonb NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.program_publish_snapshots TO authenticated;
GRANT ALL ON public.program_publish_snapshots TO service_role;

ALTER TABLE public.program_publish_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pps_staff_read ON public.program_publish_snapshots;
CREATE POLICY pps_staff_read ON public.program_publish_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice') OR public.has_role(auth.uid(), 'consultor'));

DROP POLICY IF EXISTS pps_staff_insert ON public.program_publish_snapshots;
CREATE POLICY pps_staff_insert ON public.program_publish_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));

CREATE INDEX IF NOT EXISTS idx_pps_program_created ON public.program_publish_snapshots (program_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.serialize_program_tree(p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'program', to_jsonb(p.*),
    'weeks', COALESCE((SELECT jsonb_agg(to_jsonb(w.*) ORDER BY w.week_number) FROM public.program_weeks w WHERE w.program_id = p.id), '[]'::jsonb),
    'gates', COALESCE((SELECT jsonb_agg(to_jsonb(g.*)) FROM public.program_gates g WHERE g.program_id = p.id), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(to_jsonb(s.*)) FROM public.stages s WHERE s.program_id = p.id), '[]'::jsonb),
    'playbooks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'playbook', to_jsonb(pb.*),
        'items', COALESCE((SELECT jsonb_agg(to_jsonb(pi.*)) FROM public.playbook_items pi WHERE pi.playbook_id = pb.id), '[]'::jsonb)
    )) FROM public.playbooks pb WHERE pb.program_id = p.id), '[]'::jsonb)
  ) INTO v FROM public.programs p WHERE p.id = p_program_id;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.publish_program_atomic(p_program_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type program_type; v_snapshot jsonb; v_snapshot_id uuid; v_previous uuid; v_verify jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice')) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT program_type INTO v_type FROM public.programs WHERE id = p_program_id FOR UPDATE;
  IF v_type IS NULL THEN RAISE EXCEPTION 'program_not_found' USING ERRCODE = 'P0002'; END IF;

  v_snapshot := public.serialize_program_tree(p_program_id);
  IF v_snapshot IS NULL THEN RAISE EXCEPTION 'snapshot_failed' USING ERRCODE = '23514'; END IF;

  INSERT INTO public.program_publish_snapshots(program_id, snapshot_json, reason, created_by)
    VALUES (p_program_id, v_snapshot, p_reason, auth.uid())
    RETURNING id INTO v_snapshot_id;

  SELECT id INTO v_previous FROM public.programs
    WHERE program_type = v_type AND is_active = true AND id <> p_program_id FOR UPDATE;

  IF v_previous IS NOT NULL THEN
    UPDATE public.programs SET is_active = false, updated_at = now() WHERE id = v_previous;
    v_verify := public.serialize_program_tree(v_previous);
    IF v_verify IS NULL THEN RAISE EXCEPTION 'previous_active_tree_broken' USING ERRCODE = '23514'; END IF;
  END IF;

  UPDATE public.programs SET is_active = true, updated_at = now() WHERE id = p_program_id;
  RETURN v_snapshot_id;
END; $$;

REVOKE ALL ON FUNCTION public.publish_program_atomic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_program_atomic(uuid, text) TO authenticated;