
CREATE OR REPLACE FUNCTION public.publish_program_version(
  p_program_id uuid,
  p_gates jsonb,
  p_weeks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_staff boolean;
  v_gate jsonb;
  v_week jsonb;
  v_new_gate_id uuid;
  v_gate_map jsonb := '{}'::jsonb;
  v_client_id text;
  v_gate_count int := 0;
  v_week_count int := 0;
  v_week_numbers int[] := ARRAY[]::int[];
  v_resolved_gate_id uuid;
  v_gate_ref text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT public.has_role(v_user, 'admin'::app_role)
      OR public.has_role(v_user, 'consultor'::app_role)
    INTO v_is_staff;
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'forbidden: staff role required' USING ERRCODE = '42501';
  END IF;

  -- Lock the program row so concurrent publishes serialize.
  PERFORM 1 FROM public.programs WHERE id = p_program_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'program not found: %', p_program_id USING ERRCODE = 'P0002';
  END IF;

  -- Validate week numbers are unique and in range.
  IF p_weeks IS NOT NULL AND jsonb_array_length(p_weeks) > 0 THEN
    FOR v_week IN SELECT * FROM jsonb_array_elements(p_weeks) LOOP
      IF (v_week->>'week_number') IS NULL THEN
        RAISE EXCEPTION 'week_number is required for every week';
      END IF;
      IF (v_week->>'week_number')::int < 1 OR (v_week->>'week_number')::int > 104 THEN
        RAISE EXCEPTION 'week_number % out of range (1-104)', v_week->>'week_number';
      END IF;
      IF (v_week->>'week_number')::int = ANY(v_week_numbers) THEN
        RAISE EXCEPTION 'duplicate week_number: %', v_week->>'week_number';
      END IF;
      v_week_numbers := array_append(v_week_numbers, (v_week->>'week_number')::int);
    END LOOP;
  END IF;

  -- Wipe existing weeks first (FK gate_id ON DELETE SET NULL), then gates.
  DELETE FROM public.program_weeks WHERE program_id = p_program_id;
  DELETE FROM public.program_gates WHERE program_id = p_program_id;

  -- Insert gates and build client-id -> new uuid map.
  IF p_gates IS NOT NULL THEN
    FOR v_gate IN SELECT * FROM jsonb_array_elements(p_gates) LOOP
      IF COALESCE(NULLIF(trim(v_gate->>'name'), ''), NULL) IS NULL THEN
        RAISE EXCEPTION 'every gate must have a non-empty name';
      END IF;

      INSERT INTO public.program_gates (
        program_id, name, description, sort_order, target_start_week, target_end_week
      )
      VALUES (
        p_program_id,
        v_gate->>'name',
        NULLIF(v_gate->>'description', ''),
        COALESCE((v_gate->>'sort_order')::int, v_gate_count),
        NULLIF(v_gate->>'target_start_week', '')::int,
        NULLIF(v_gate->>'target_end_week', '')::int
      )
      RETURNING id INTO v_new_gate_id;

      v_client_id := COALESCE(v_gate->>'__local_id', v_gate->>'id');
      IF v_client_id IS NOT NULL THEN
        v_gate_map := v_gate_map || jsonb_build_object(v_client_id, v_new_gate_id::text);
      END IF;
      v_gate_count := v_gate_count + 1;
    END LOOP;
  END IF;

  -- Insert weeks, remapping gate_id via v_gate_map.
  IF p_weeks IS NOT NULL THEN
    FOR v_week IN SELECT * FROM jsonb_array_elements(p_weeks) LOOP
      v_gate_ref := v_week->>'gate_id';
      v_resolved_gate_id := NULL;
      IF v_gate_ref IS NOT NULL AND v_gate_ref <> '' THEN
        IF v_gate_map ? v_gate_ref THEN
          v_resolved_gate_id := (v_gate_map->>v_gate_ref)::uuid;
        ELSE
          -- Client passed a stale/unknown gate reference.
          RAISE EXCEPTION 'week % references unknown gate %', v_week->>'week_number', v_gate_ref;
        END IF;
      END IF;

      INSERT INTO public.program_weeks (
        program_id, gate_id, week_number, title, description, deliverables_json
      )
      VALUES (
        p_program_id,
        v_resolved_gate_id,
        (v_week->>'week_number')::int,
        COALESCE(v_week->>'title', 'Week ' || (v_week->>'week_number')),
        NULLIF(v_week->>'description', ''),
        COALESCE(v_week->'deliverables_json', '[]'::jsonb)
      );
      v_week_count := v_week_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'program_id', p_program_id,
    'gates_inserted', v_gate_count,
    'weeks_inserted', v_week_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_program_version(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_program_version(uuid, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.publish_program_version(uuid, jsonb, jsonb) IS
  'Atomically replaces gates+weeks+deliverables for an acceleration program. Staff-only. All-or-nothing.';
