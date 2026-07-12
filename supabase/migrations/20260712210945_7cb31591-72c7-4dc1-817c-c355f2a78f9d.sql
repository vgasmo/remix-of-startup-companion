
CREATE OR REPLACE FUNCTION public.list_ecosystem_items(
  p_program_id uuid DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_health text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL,
  p_has_startup_portugal boolean DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  item_type text,
  workspace_id uuid,
  funnel_item_id uuid,
  name text,
  program_id uuid,
  program_name text,
  stage text,
  health_score text,
  priority_level text,
  startup_category text,
  owner_id uuid,
  owner_name text,
  last_activity_at timestamptz,
  next_meeting_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  has_startup_portugal_status boolean,
  startup_portugal_document_path text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ws AS (
    SELECT
      w.id,
      'workspace'::text AS item_type,
      w.id AS workspace_id,
      NULL::uuid AS funnel_item_id,
      s.name,
      w.program_id,
      pg.name AS program_name,
      w.stage::text,
      COALESCE(w.health_score_override::text, w.health_score::text) AS health_score,
      w.priority_level::text,
      w.startup_category,
      COALESCE(
        w.assigned_consultor_id,
        (SELECT wu.user_id FROM public.workspace_users wu
         WHERE wu.workspace_id = w.id AND wu.role = 'consultor' AND wu.active = true
         ORDER BY wu.user_id LIMIT 1)
      ) AS owner_id,
      w.updated_at AS last_activity_at,
      NULL::timestamptz AS next_meeting_at,
      w.created_at,
      w.updated_at,
      COALESCE(s.has_startup_portugal_status, false) AS has_startup_portugal_status,
      s.startup_portugal_document_path
    FROM public.workspaces w
    LEFT JOIN public.startups s ON s.id = w.startup_id
    LEFT JOIN public.programs pg ON pg.id = w.program_id
    WHERE w.status IN ('imported_unclaimed','claimed','pending','active')
      AND s.name IS NOT NULL
      AND (p_program_id IS NULL OR w.program_id = p_program_id)
      AND (p_stage IS NULL OR w.stage::text = p_stage)
      AND (p_health IS NULL OR w.health_score::text = p_health OR w.health_score_override::text = p_health)
      AND (p_has_startup_portugal IS NULL OR COALESCE(s.has_startup_portugal_status,false) = p_has_startup_portugal)
      AND (p_search IS NULL OR s.name ILIKE '%'||p_search||'%')
  ),
  fi AS (
    SELECT
      f.id,
      'lead'::text AS item_type,
      NULL::uuid AS workspace_id,
      f.id AS funnel_item_id,
      COALESCE(f.organization_name, f.contact_name, 'Unknown Lead') AS name,
      f.program_id,
      pg.name AS program_name,
      f.stage::text,
      NULL::text AS health_score,
      NULL::text AS priority_level,
      NULL::text AS startup_category,
      f.owner_consultant_id AS owner_id,
      COALESCE(f.last_activity_at, f.updated_at) AS last_activity_at,
      f.next_action_at AS next_meeting_at,
      f.created_at,
      f.updated_at,
      false AS has_startup_portugal_status,
      NULL::text AS startup_portugal_document_path
    FROM public.funnel_items f
    LEFT JOIN public.programs pg ON pg.id = f.program_id
    WHERE f.linked_workspace_id IS NULL
      AND f.stage::text NOT IN ('lost','disqualified','contracted')
      AND (p_program_id IS NULL OR f.program_id = p_program_id)
      AND (p_stage IS NULL OR f.stage::text = p_stage)
      AND (p_owner_id IS NULL OR f.owner_consultant_id = p_owner_id)
      AND (p_has_startup_portugal IS NOT TRUE)
      AND (p_search IS NULL OR COALESCE(f.organization_name, f.contact_name, '') ILIKE '%'||p_search||'%')
  ),
  combined AS (
    SELECT * FROM ws
    UNION ALL
    SELECT * FROM fi
  )
  SELECT
    c.id, c.item_type, c.workspace_id, c.funnel_item_id, c.name,
    c.program_id, c.program_name, c.stage, c.health_score,
    c.priority_level, c.startup_category, c.owner_id,
    ps.full_name AS owner_name,
    c.last_activity_at, c.next_meeting_at, c.created_at, c.updated_at,
    c.has_startup_portugal_status, c.startup_portugal_document_path
  FROM combined c
  LEFT JOIN public.profiles_safe ps ON ps.id = c.owner_id
  ORDER BY c.updated_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.list_ecosystem_items(uuid, text, text, uuid, boolean, text, int) TO authenticated;
