
-- Broaden active-contract match: real contracts today live in states like
-- 'pending_signature' before they become 'active'. Any non-terminated,
-- non-archived contract is the workspace's current incubation type.
CREATE OR REPLACE FUNCTION public.list_ecosystem_items_v2(
  p_program_id            uuid       DEFAULT NULL,
  p_stage                 text       DEFAULT NULL,
  p_health                text       DEFAULT NULL,
  p_owner_id              uuid       DEFAULT NULL,
  p_has_startup_portugal  boolean    DEFAULT NULL,
  p_search                text       DEFAULT NULL,
  p_cursor_activity       timestamptz DEFAULT NULL,
  p_cursor_id             uuid       DEFAULT NULL,
  p_page_size             integer    DEFAULT 50,
  p_building_id           uuid       DEFAULT NULL,
  p_incubation_type_id    uuid       DEFAULT NULL,
  p_modality              text       DEFAULT NULL,
  p_tier                  text       DEFAULT NULL
)
RETURNS TABLE (
  id uuid, item_type text, workspace_id uuid, funnel_item_id uuid, name text,
  program_id uuid, program_name text, stage text, health_score text,
  priority_level text, startup_category text, owner_id uuid, owner_name text,
  last_activity_at timestamptz, next_meeting_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  has_startup_portugal_status boolean, startup_portugal_document_path text,
  incubation_type_id uuid, incubation_type_name text, modality text,
  building_id uuid, building_name text, space_id uuid, space_name text,
  total_count bigint, next_cursor_activity timestamptz, next_cursor_id uuid
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH ws_active_contract AS (
    SELECT DISTINCT ON (sc.workspace_id)
      sc.workspace_id, sc.incubation_type_id
    FROM public.startup_contracts sc
    WHERE sc.terminated_at IS NULL
      AND sc.archived_at IS NULL
      AND sc.status IN ('active','pending_signature','signed','pending_start')
    ORDER BY sc.workspace_id, sc.start_date DESC NULLS LAST, sc.created_at DESC
  ),
  ws_current_space AS (
    SELECT DISTINCT ON (sa.workspace_id)
      sa.workspace_id, sa.office_space_id,
      os.name AS space_name, os.building_id, b.name AS building_name
    FROM public.space_allocations sa
    LEFT JOIN public.office_spaces os ON os.id = sa.office_space_id
    LEFT JOIN public.buildings b     ON b.id = os.building_id
    WHERE sa.end_date IS NULL OR sa.end_date > CURRENT_DATE
    ORDER BY sa.workspace_id, sa.start_date DESC NULLS LAST
  ),
  ws AS (
    SELECT
      w.id, 'workspace'::text AS item_type, w.id AS workspace_id, NULL::uuid AS funnel_item_id,
      s.name, w.program_id, pg.name AS program_name, w.stage::text,
      COALESCE(w.health_score_override::text, w.health_score::text) AS health_score,
      w.priority_level::text, w.startup_category,
      COALESCE(w.assigned_consultor_id,
        (SELECT wu.user_id FROM public.workspace_users wu
         WHERE wu.workspace_id = w.id AND wu.role = 'consultor' AND wu.active = true
         ORDER BY wu.user_id LIMIT 1)) AS owner_id,
      w.updated_at AS last_activity_at, NULL::timestamptz AS next_meeting_at,
      w.created_at, w.updated_at,
      COALESCE(s.has_startup_portugal_status, false) AS has_startup_portugal_status,
      s.startup_portugal_document_path,
      it.id AS incubation_type_id, it.name AS incubation_type_name,
      CASE WHEN it.id IS NULL THEN NULL
           WHEN it.is_virtual IS TRUE THEN 'virtual'
           ELSE 'physical' END AS modality,
      cs.building_id, cs.building_name, cs.office_space_id AS space_id, cs.space_name
    FROM public.workspaces w
    LEFT JOIN public.startups s ON s.id = w.startup_id
    LEFT JOIN public.programs pg ON pg.id = w.program_id
    LEFT JOIN ws_active_contract ac ON ac.workspace_id = w.id
    LEFT JOIN public.incubation_types it ON it.id = ac.incubation_type_id
    LEFT JOIN ws_current_space cs ON cs.workspace_id = w.id
    WHERE w.status IN ('imported_unclaimed','claimed','pending','active')
      AND s.name IS NOT NULL
      AND (p_program_id IS NULL OR w.program_id = p_program_id)
      AND (p_stage IS NULL OR w.stage::text = p_stage)
      AND (p_health IS NULL OR w.health_score::text = p_health OR w.health_score_override::text = p_health)
      AND (p_has_startup_portugal IS NULL OR COALESCE(s.has_startup_portugal_status,false) = p_has_startup_portugal)
      AND (p_search IS NULL OR s.name ILIKE '%'||p_search||'%')
      AND (p_incubation_type_id IS NULL OR ac.incubation_type_id = p_incubation_type_id)
      AND (p_building_id IS NULL OR cs.building_id = p_building_id)
      AND (p_modality IS NULL OR (
        (p_modality='virtual' AND it.is_virtual IS TRUE) OR
        (p_modality='physical' AND (it.is_virtual IS FALSE OR it.is_virtual IS NULL))
      ))
      AND (p_tier IS NULL OR (
        (p_tier='unclassified' AND (w.startup_category IS NULL OR w.startup_category='')) OR
        (p_tier IN ('A','B','C') AND w.startup_category=p_tier)
      ))
  ),
  fi AS (
    SELECT f.id, 'lead'::text AS item_type, NULL::uuid AS workspace_id, f.id AS funnel_item_id,
      COALESCE(f.organization_name, f.contact_name, 'Unknown Lead') AS name,
      f.program_id, pg.name AS program_name, f.stage::text,
      NULL::text AS health_score, NULL::text AS priority_level, NULL::text AS startup_category,
      f.owner_consultant_id AS owner_id,
      COALESCE(f.last_activity_at, f.updated_at) AS last_activity_at,
      f.next_action_at AS next_meeting_at, f.created_at, f.updated_at,
      false AS has_startup_portugal_status, NULL::text AS startup_portugal_document_path,
      NULL::uuid AS incubation_type_id, NULL::text AS incubation_type_name, NULL::text AS modality,
      NULL::uuid AS building_id, NULL::text AS building_name,
      NULL::uuid AS space_id, NULL::text AS space_name
    FROM public.funnel_items f
    LEFT JOIN public.programs pg ON pg.id = f.program_id
    WHERE f.linked_workspace_id IS NULL
      AND f.stage::text NOT IN ('lost','disqualified','contracted')
      AND (p_program_id IS NULL OR f.program_id = p_program_id)
      AND (p_stage IS NULL OR f.stage::text = p_stage)
      AND (p_owner_id IS NULL OR f.owner_consultant_id = p_owner_id)
      AND (p_has_startup_portugal IS NOT TRUE)
      AND (p_incubation_type_id IS NULL)
      AND (p_building_id IS NULL)
      AND (p_modality IS NULL)
      AND (p_tier IS NULL)
      AND (p_search IS NULL OR COALESCE(f.organization_name, f.contact_name, '') ILIKE '%'||p_search||'%')
  ),
  combined AS (
    SELECT * FROM ws WHERE p_owner_id IS NULL OR owner_id = p_owner_id
    UNION ALL SELECT * FROM fi
  ),
  normalized AS (
    SELECT c.*, ps.full_name AS owner_name,
           COALESCE(c.last_activity_at,'epoch'::timestamptz) AS sort_activity
    FROM combined c LEFT JOIN public.profiles_safe ps ON ps.id = c.owner_id
  ),
  filtered AS (
    SELECT * FROM normalized n
    WHERE p_cursor_id IS NULL
       OR (n.sort_activity, n.id) < (COALESCE(p_cursor_activity,'epoch'::timestamptz), p_cursor_id)
  ),
  counted AS (SELECT COUNT(*) AS ct FROM combined),
  page AS (SELECT * FROM filtered ORDER BY sort_activity DESC, id DESC
           LIMIT GREATEST(1, LEAST(COALESCE(p_page_size,50),200)))
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

CREATE OR REPLACE FUNCTION public.ecosystem_aggregates_v2(
  p_program_id            uuid       DEFAULT NULL,
  p_stage                 text       DEFAULT NULL,
  p_health                text       DEFAULT NULL,
  p_owner_id              uuid       DEFAULT NULL,
  p_has_startup_portugal  boolean    DEFAULT NULL,
  p_search                text       DEFAULT NULL,
  p_building_id           uuid       DEFAULT NULL,
  p_incubation_type_id    uuid       DEFAULT NULL,
  p_modality              text       DEFAULT NULL,
  p_tier                  text       DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH ws_active_contract AS (
    SELECT DISTINCT ON (sc.workspace_id) sc.workspace_id, sc.incubation_type_id
    FROM public.startup_contracts sc
    WHERE sc.terminated_at IS NULL AND sc.archived_at IS NULL
      AND sc.status IN ('active','pending_signature','signed','pending_start')
    ORDER BY sc.workspace_id, sc.start_date DESC NULLS LAST, sc.created_at DESC
  ),
  ws_current_space AS (
    SELECT DISTINCT ON (sa.workspace_id) sa.workspace_id, sa.office_space_id, os.building_id
    FROM public.space_allocations sa
    LEFT JOIN public.office_spaces os ON os.id = sa.office_space_id
    WHERE sa.end_date IS NULL OR sa.end_date > CURRENT_DATE
    ORDER BY sa.workspace_id, sa.start_date DESC NULLS LAST
  ),
  filtered AS (
    SELECT w.id, w.program_id, w.startup_category, w.stage::text AS stage,
      COALESCE(w.assigned_consultor_id,
        (SELECT wu.user_id FROM public.workspace_users wu
         WHERE wu.workspace_id=w.id AND wu.role='consultor' AND wu.active=true
         ORDER BY wu.user_id LIMIT 1)) AS owner_id,
      ac.incubation_type_id, it.name AS incubation_type_name,
      CASE WHEN it.id IS NULL THEN NULL WHEN it.is_virtual IS TRUE THEN 'virtual' ELSE 'physical' END AS modality,
      cs.building_id, pg.name AS program_name,
      COALESCE(w.health_score_override::text, w.health_score::text) AS health_score
    FROM public.workspaces w
    LEFT JOIN public.startups s ON s.id=w.startup_id
    LEFT JOIN public.programs pg ON pg.id=w.program_id
    LEFT JOIN ws_active_contract ac ON ac.workspace_id=w.id
    LEFT JOIN public.incubation_types it ON it.id=ac.incubation_type_id
    LEFT JOIN ws_current_space cs ON cs.workspace_id=w.id
    WHERE w.status IN ('imported_unclaimed','claimed','pending','active') AND s.name IS NOT NULL
      AND (p_program_id IS NULL OR w.program_id=p_program_id)
      AND (p_stage IS NULL OR w.stage::text=p_stage)
      AND (p_health IS NULL OR w.health_score::text=p_health OR w.health_score_override::text=p_health)
      AND (p_has_startup_portugal IS NULL OR COALESCE(s.has_startup_portugal_status,false)=p_has_startup_portugal)
      AND (p_search IS NULL OR s.name ILIKE '%'||p_search||'%')
      AND (p_owner_id IS NULL OR COALESCE(w.assigned_consultor_id,
        (SELECT wu.user_id FROM public.workspace_users wu
         WHERE wu.workspace_id=w.id AND wu.role='consultor' AND wu.active=true
         ORDER BY wu.user_id LIMIT 1))=p_owner_id)
      AND (p_incubation_type_id IS NULL OR ac.incubation_type_id=p_incubation_type_id)
      AND (p_building_id IS NULL OR cs.building_id=p_building_id)
      AND (p_modality IS NULL OR (
        (p_modality='virtual' AND it.is_virtual IS TRUE) OR
        (p_modality='physical' AND (it.is_virtual IS FALSE OR it.is_virtual IS NULL))
      ))
      AND (p_tier IS NULL OR (
        (p_tier='unclassified' AND (w.startup_category IS NULL OR w.startup_category='')) OR
        (p_tier IN ('A','B','C') AND w.startup_category=p_tier)
      ))
  )
  SELECT jsonb_build_object(
    'total_active', (SELECT COUNT(*) FROM filtered),
    'unassigned', (SELECT COUNT(*) FROM filtered WHERE owner_id IS NULL),
    'by_incubation_type', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id',incubation_type_id,'name',incubation_type_name,'count',ct)), '[]'::jsonb)
      FROM (SELECT incubation_type_id, incubation_type_name, COUNT(*) AS ct FROM filtered
            GROUP BY incubation_type_id, incubation_type_name ORDER BY ct DESC NULLS LAST) x
    ),
    'by_tier', (SELECT COALESCE(jsonb_object_agg(coalesce(startup_category,'unclassified'),ct),'{}'::jsonb)
                FROM (SELECT startup_category, COUNT(*) AS ct FROM filtered GROUP BY startup_category) x),
    'by_consultant', (SELECT COALESCE(jsonb_agg(jsonb_build_object('consultant_id',owner_id,'count',ct)),'[]'::jsonb)
                      FROM (SELECT owner_id, COUNT(*) AS ct FROM filtered WHERE owner_id IS NOT NULL
                            GROUP BY owner_id ORDER BY ct DESC) x),
    'by_modality', (SELECT COALESCE(jsonb_object_agg(coalesce(modality,'unknown'),ct),'{}'::jsonb)
                    FROM (SELECT modality, COUNT(*) AS ct FROM filtered GROUP BY modality) x),
    'by_program', (SELECT COALESCE(jsonb_agg(jsonb_build_object('program_id',program_id,'program_name',program_name,'count',ct)),'[]'::jsonb)
                   FROM (SELECT program_id, program_name, COUNT(*) AS ct FROM filtered
                         GROUP BY program_id, program_name ORDER BY ct DESC) x),
    'at_risk', (SELECT COUNT(*) FROM filtered WHERE health_score IN ('at_risk','critical'))
  );
$function$;
