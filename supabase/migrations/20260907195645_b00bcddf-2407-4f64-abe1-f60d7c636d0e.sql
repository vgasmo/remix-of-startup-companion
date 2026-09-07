-- P2.13 — enqueue the staff work queue item server-side (founders cannot insert
-- into staff_work_queue_items: the only write policy is admin/consultor).
CREATE OR REPLACE FUNCTION public.tg_stage_gate_review_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.staff_work_queue_items (
    workspace_id, type, title, description, priority, status, due_at, evidence_json, created_by
  ) VALUES (
    NEW.workspace_id,
    'stage_gate_review',
    format('Stage Gate Review: %s → %s', NEW.from_stage, NEW.to_stage),
    'Pedido de revisão de stage gate',
    'high',
    'open',
    now() + interval '7 days',
    jsonb_build_object('review_id', NEW.id),
    NEW.requested_by
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_stage_gate_review_enqueue() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stage_gate_review_enqueue ON public.stage_gate_reviews;
CREATE TRIGGER stage_gate_review_enqueue
AFTER INSERT ON public.stage_gate_reviews
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.tg_stage_gate_review_enqueue();

-- P2.10 — drop the stale 13-argument overload of list_ecosystem_items_v2 so
-- PostgREST can never hit PGRST203 (function overload ambiguity).
DROP FUNCTION IF EXISTS public.list_ecosystem_items_v2(uuid, text, text, uuid, boolean, text, timestamptz, uuid, integer, uuid, uuid, text, text);

-- P2.10 (cont.) — 'signed' and 'pending_start' are not valid startup_contracts
-- statuses (they belong to contract_intakes). Rewrite the live definition in
-- place so no other behaviour changes.
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'list_ecosystem_items_v2'
  ORDER BY p.pronargs DESC
  LIMIT 1;

  IF def IS NULL THEN
    RAISE EXCEPTION 'list_ecosystem_items_v2 not found';
  END IF;

  IF position('''signed'',''pending_start''' in replace(def, ' ', '')) > 0 THEN
    def := replace(
      def,
      'sc.status IN (''active'',''pending_signature'',''signed'',''pending_start'')',
      'sc.status IN (''active'',''pending_signature'')'
    );
    def := replace(
      def,
      'sc.status IN (''active'', ''pending_signature'', ''signed'', ''pending_start'')',
      'sc.status IN (''active'', ''pending_signature'')'
    );
    EXECUTE def;
  END IF;
END $$;

-- P2.11 — backoffice must still read deactivated programs (otherwise the
-- ecosystem list shows a NULL program name).
DROP POLICY IF EXISTS "Authenticated users can view active programs" ON public.programs;
CREATE POLICY "Authenticated users can view programs"
ON public.programs
FOR SELECT
TO authenticated
USING (is_active OR public.is_staff() OR public.is_backoffice() OR public.has_program_access(id));