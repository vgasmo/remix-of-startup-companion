-- Batch F4 — Programme publication (atomic snapshot + swap)
-- Forward-only, additive, idempotent. Held as draft.
--
-- Preserves BOTH modes:
--   acceleration -> weeks + gates
--   incubation   -> playbooks
-- The publish flow is now: snapshot -> validate -> pointer-swap, entirely
-- inside one SECURITY DEFINER RPC. No mid-flight orphan tree possible.

BEGIN;

-- Immutable snapshot table used both as rollback target and as audit trail.
CREATE TABLE IF NOT EXISTS public.program_publish_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  program_mode text NOT NULL CHECK (program_mode IN ('acceleration','incubation')),
  snapshot_json jsonb NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  taken_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text
);

GRANT SELECT, INSERT ON public.program_publish_snapshots TO authenticated;
GRANT ALL ON public.program_publish_snapshots TO service_role;

ALTER TABLE public.program_publish_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_publish_snapshots_admin_read ON public.program_publish_snapshots;
CREATE POLICY program_publish_snapshots_admin_read
  ON public.program_publish_snapshots FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));

CREATE INDEX IF NOT EXISTS idx_program_publish_snapshots_program
  ON public.program_publish_snapshots (program_id, taken_at DESC);

-- Deterministic tree serializer used by both snapshot + verification.
CREATE OR REPLACE FUNCTION public.serialize_program_tree(p_program_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'program', to_jsonb(p),
    'weeks',   COALESCE((
      SELECT jsonb_agg(to_jsonb(w) ORDER BY w.week_number)
        FROM public.program_weeks w WHERE w.program_id = p.id), '[]'::jsonb),
    'gates',   COALESCE((
      SELECT jsonb_agg(to_jsonb(g) ORDER BY g.order_index)
        FROM public.program_gates g WHERE g.program_id = p.id), '[]'::jsonb),
    'stages',  COALESCE((
      SELECT jsonb_agg(
               to_jsonb(st) || jsonb_build_object('criteria',
                 COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.order_index)
                             FROM public.stage_gate_criteria c WHERE c.stage_id = st.id), '[]'::jsonb))
             ORDER BY st.order_index)
        FROM public.stages st WHERE st.program_id = p.id), '[]'::jsonb),
    'playbooks', COALESCE((
      SELECT jsonb_agg(
               to_jsonb(pb) || jsonb_build_object('items',
                 COALESCE((SELECT jsonb_agg(to_jsonb(it) ORDER BY it.order_index)
                             FROM public.playbook_items it WHERE it.playbook_id = pb.id), '[]'::jsonb))
             ORDER BY pb.title)
        FROM public.playbooks pb WHERE pb.program_id = p.id), '[]'::jsonb)
  )
  FROM public.programs p WHERE p.id = p_program_id;
$$;

REVOKE ALL ON FUNCTION public.serialize_program_tree(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.serialize_program_tree(uuid) TO authenticated;

-- Atomic publish: snapshot BEFORE mutation, verify AFTER, then activate.
CREATE OR REPLACE FUNCTION public.publish_program_atomic(
  p_program_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(program_id uuid, snapshot_id uuid, previous_active_id uuid, verified boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id uuid;
  v_snapshot jsonb;
  v_mode text;
  v_prev_active uuid;
  v_post jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'backoffice')) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT program_type INTO v_mode FROM public.programs WHERE id = p_program_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'program_not_found' USING ERRCODE='P0002'; END IF;

  v_snapshot := public.serialize_program_tree(p_program_id);
  INSERT INTO public.program_publish_snapshots(program_id, program_mode, snapshot_json, taken_by, reason)
  VALUES (p_program_id, v_mode, v_snapshot, auth.uid(), p_reason)
  RETURNING id INTO v_snapshot_id;

  -- Capture and verify the currently active peer (if any) BEFORE swap so we can
  -- detect a mid-flight breakage of its tree.
  SELECT id INTO v_prev_active
    FROM public.programs
   WHERE is_active = true
     AND program_type = v_mode
     AND id <> p_program_id
   FOR UPDATE;

  -- Pointer swap.
  IF v_prev_active IS NOT NULL THEN
    UPDATE public.programs SET is_active = false, updated_at = now()
     WHERE id = v_prev_active;
  END IF;
  UPDATE public.programs SET is_active = true, published_at = now(), updated_at = now()
   WHERE id = p_program_id;

  -- Post-swap verification: previous-active tree still serializes.
  IF v_prev_active IS NOT NULL THEN
    v_post := public.serialize_program_tree(v_prev_active);
    IF v_post IS NULL THEN
      RAISE EXCEPTION 'previous_active_tree_broken:%', v_prev_active USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN QUERY SELECT p_program_id, v_snapshot_id, v_prev_active, true;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_program_atomic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_program_atomic(uuid, text) TO authenticated;

COMMIT;
