CREATE OR REPLACE FUNCTION public.list_ecosystem_items_v2(p_program_id uuid DEFAULT NULL::uuid, p_stage text DEFAULT NULL::text, p_health text DEFAULT NULL::text, p_owner_id uuid DEFAULT NULL::uuid, p_has_startup_portugal boolean DEFAULT NULL::boolean, p_search text DEFAULT NULL::text, p_cursor_activity timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 50, p_building_id uuid DEFAULT NULL::uuid, p_incubation_type_id uuid DEFAULT NULL::uuid, p_modality text DEFAULT NULL::text, p_tier text DEFAULT NULL::text)
RETURNS TABLE(id uuid, item_type text, workspace_id uuid, funnel_item_id uuid, name text, program_id uuid, program_name text, stage text, health_score text, priority_level text, startup_category text, owner_id uuid, owner_name text, last_activity_at timestamp with time zone, next_meeting_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, has_startup_portugal_status boolean, startup_portugal_document_path text, incubation_type_id uuid, incubation_type_name text, modality text, building_id uuid, building_name text, space_id uuid, space_name text, total_count bigint, next_cursor_activity timestamp with time zone, next_cursor_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH ws_active_contract AS (
    SELECT DISTINCT ON (sc.workspace_id) sc.workspace_id, sc.incubation_type_id
    FROM public.startup_contracts sc
    WHERE sc.terminated_at IS NULL AND sc.archived_at IS NULL
      AND sc.status IN ('active','pending_signature','signed','pending_start')
    ORDER BY sc.workspace_id, sc.start_date DESC NULLS LAST, sc.created_at DESC
  ),
  ws_current_space AS (
    SELECT DISTINCT ON (sa.workspace_id) sa.workspace_id, sa.office_space_id,
      os.name AS space_name, os.building_id, b.name AS building_name
    FROM public.space_allocations sa
    LEFT JOIN public.office_spaces os ON os.id = sa.office_space_id
    LEFT JOIN public.buildings b ON b.id = os.building_id
    WHERE sa.end_date IS NULL OR sa.end_date > CURRENT_DATE
    ORDER BY sa.workspace_id, sa.start_date DESC NULLS LAST
  ),
  workspace_activity AS (
    SELECT source.workspace_id, max(source.occurred_at) AS last_activity_at
    FROM (
      SELECT al.workspace_id, al.created_at AS occurred_at
      FROM public.activity_log al WHERE al.workspace_id IS NOT NULL
      UNION ALL
      SELECT cl.workspace_id, cl.occurred_at
      FROM public.communication_log cl
      WHERE cl.workspace_id IS NOT NULL AND cl.archived_at IS NULL
      UNION ALL
      SELECT we.workspace_id, we.created_at
      FROM public.workspace_engagement_events we
      WHERE we.event_type <> 'view'
      UNION ALL
      SELECT se.workspace_id, COALESCE(se.completed_at, se.created_at)
      FROM public.sessions se WHERE se.workspace_id IS NOT NULL
      UNION ALL
      SELECT ai.workspace_id, COALESCE(ai.completed_at, ai.created_at)
      FROM public.action_items ai WHERE ai.workspace_id IS NOT NULL
      UNION ALL
      SELECT m.workspace_id, COALESCE(m.completed_at, m.created_at)
      FROM public.milestones m WHERE m.workspace_id IS NOT NULL
      UNION ALL
      SELECT kv.workspace_id, kv.updated_at
      FROM public.kpi_values kv WHERE kv.workspace_id IS NOT NULL
      UNION ALL
      SELECT d.workspace_id, d.updated_at
      FROM public.documents d WHERE d.workspace_id IS NOT NULL
    ) source
    GROUP BY source.workspace_id
  ),
  ws AS (
    SELECT w.id, 'workspace'::text AS item_type, w.id AS workspace_id, NULL::uuid AS funnel_item_id,
      s.name, w.program_id, pg.name AS program_name, w.stage::text,
      COALESCE(w.health_score_override::text, w.health_score::text) AS health_score,
      w.priority_level::text, w.startup_category,
      COALESCE(w.assigned_consultor_id,
        (SELECT wu.user_id FROM public.workspace_users wu
         WHERE wu.workspace_id = w.id AND wu.role = 'consultor' AND wu.active = true
         ORDER BY wu.user_id LIMIT 1)) AS owner_id,
      COALESCE(wa.last_activity_at, w.created_at) AS last_activity_at,
      NULL::timestamptz AS next_meeting_at, w.created_at, w.updated_at,
      COALESCE(s.has_startup_portugal_status, false) AS has_startup_portugal_status,
      s.startup_portugal_document_path,
      it.id AS incubation_type_id, it.name AS incubation_type_name,
      CASE WHEN it.id IS NULL THEN NULL WHEN it.is_virtual IS TRUE THEN 'virtual' ELSE 'physical' END AS modality,
      cs.building_id, cs.building_name, cs.office_space_id AS space_id, cs.space_name
    FROM public.workspaces w
    LEFT JOIN public.startups s ON s.id = w.startup_id
    LEFT JOIN public.programs pg ON pg.id = w.program_id
    LEFT JOIN ws_active_contract ac ON ac.workspace_id = w.id
    LEFT JOIN public.incubation_types it ON it.id = ac.incubation_type_id
    LEFT JOIN ws_current_space cs ON cs.workspace_id = w.id
    LEFT JOIN workspace_activity wa ON wa.workspace_id = w.id
    WHERE w.status IN ('imported_unclaimed','claimed','pending','active')
      AND s.name IS NOT NULL
      AND (p_program_id IS NULL OR w.program_id = p_program_id)
      AND (p_stage IS NULL OR w.stage::text = p_stage)
      AND (p_health IS NULL OR w.health_score::text = p_health OR w.health_score_override::text = p_health)
      AND (p_has_startup_portugal IS NULL OR COALESCE(s.has_startup_portugal_status,false) = p_has_startup_portugal)
      AND (p_search IS NULL OR s.name ILIKE '%'||p_search||'%')
      AND (p_incubation_type_id IS NULL OR ac.incubation_type_id = p_incubation_type_id)
      AND (p_building_id IS NULL OR cs.building_id = p_building_id)
      AND (p_modality IS NULL OR ((p_modality='virtual' AND it.is_virtual IS TRUE) OR (p_modality='physical' AND (it.is_virtual IS FALSE OR it.is_virtual IS NULL))))
      AND (p_tier IS NULL OR ((p_tier='unclassified' AND (w.startup_category IS NULL OR w.startup_category='')) OR (p_tier IN ('A','B','C') AND w.startup_category=p_tier)))
  ),
  fi AS (
    SELECT f.id, 'lead'::text AS item_type, NULL::uuid AS workspace_id, f.id AS funnel_item_id,
      COALESCE(f.organization_name, f.contact_name, 'Unknown Lead') AS name,
      f.program_id, pg.name AS program_name, f.stage::text,
      NULL::text AS health_score, NULL::text AS priority_level, NULL::text AS startup_category,
      f.owner_consultant_id AS owner_id, COALESCE(f.last_activity_at, f.updated_at) AS last_activity_at,
      f.next_action_at AS next_meeting_at, f.created_at, f.updated_at,
      false AS has_startup_portugal_status, NULL::text AS startup_portugal_document_path,
      NULL::uuid AS incubation_type_id, NULL::text AS incubation_type_name, NULL::text AS modality,
      NULL::uuid AS building_id, NULL::text AS building_name, NULL::uuid AS space_id, NULL::text AS space_name
    FROM public.funnel_items f
    LEFT JOIN public.programs pg ON pg.id = f.program_id
    WHERE f.linked_workspace_id IS NULL AND f.stage::text NOT IN ('lost','disqualified','contracted')
      AND (p_program_id IS NULL OR f.program_id = p_program_id)
      AND (p_stage IS NULL OR f.stage::text = p_stage)
      AND (p_owner_id IS NULL OR f.owner_consultant_id = p_owner_id)
      AND (p_has_startup_portugal IS NOT TRUE) AND p_incubation_type_id IS NULL
      AND p_building_id IS NULL AND p_modality IS NULL AND p_tier IS NULL
      AND (p_search IS NULL OR COALESCE(f.organization_name, f.contact_name, '') ILIKE '%'||p_search||'%')
  ),
  combined AS (SELECT * FROM ws WHERE p_owner_id IS NULL OR owner_id = p_owner_id UNION ALL SELECT * FROM fi),
  normalized AS (
    SELECT c.*, ps.full_name AS owner_name, COALESCE(c.last_activity_at,'epoch'::timestamptz) AS sort_activity
    FROM combined c LEFT JOIN public.profiles_safe ps ON ps.id = c.owner_id
  ),
  filtered AS (
    SELECT * FROM normalized n WHERE p_cursor_id IS NULL
      OR (n.sort_activity, n.id) < (COALESCE(p_cursor_activity,'epoch'::timestamptz), p_cursor_id)
  ),
  counted AS (SELECT COUNT(*) AS ct FROM combined),
  page AS (SELECT * FROM filtered ORDER BY sort_activity DESC, id DESC LIMIT GREATEST(1, LEAST(COALESCE(p_page_size,50),200)))
  SELECT p.id, p.item_type, p.workspace_id, p.funnel_item_id, p.name,
    p.program_id, p.program_name, p.stage, p.health_score, p.priority_level,
    p.startup_category, p.owner_id, p.owner_name, p.last_activity_at, p.next_meeting_at,
    p.created_at, p.updated_at, p.has_startup_portugal_status, p.startup_portugal_document_path,
    p.incubation_type_id, p.incubation_type_name, p.modality,
    p.building_id, p.building_name, p.space_id, p.space_name,
    (SELECT ct FROM counted) AS total_count,
    p.sort_activity AS next_cursor_activity, p.id AS next_cursor_id
  FROM page p;
$function$;