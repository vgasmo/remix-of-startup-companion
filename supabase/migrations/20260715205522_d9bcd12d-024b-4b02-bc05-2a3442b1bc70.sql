
-- Phase 4a: profiles_export for service-role snapshot use
-- profiles_safe filters by auth.uid() (returns 0 rows for service_role),
-- which caused ecosystem snapshots to silently record empty profile arrays.
CREATE OR REPLACE VIEW public.profiles_export
WITH (security_invoker = true) AS
SELECT id, full_name, avatar_url, bio, expertise, email, phone, linkedin_url,
       created_at, updated_at
FROM public.profiles;

REVOKE ALL ON public.profiles_export FROM PUBLIC;
REVOKE ALL ON public.profiles_export FROM anon, authenticated;
GRANT SELECT ON public.profiles_export TO service_role;

COMMENT ON VIEW public.profiles_export IS
'Service-role only export view of profiles. Bypasses profiles_safe auth.uid() filter for backup/snapshot jobs.';

-- Phase 4b: list_ecosystem_items_v2 surfaces contracted funnel rows lacking a workspace
-- so staff can see leads that were contracted but never provisioned.
CREATE OR REPLACE FUNCTION public.list_ecosystem_items_v2(
  p_program_id uuid DEFAULT NULL::uuid,
  p_stage text DEFAULT NULL::text,
  p_health text DEFAULT NULL::text,
  p_owner_id uuid DEFAULT NULL::uuid,
  p_has_startup_portugal boolean DEFAULT NULL::boolean,
  p_search text DEFAULT NULL::text,
  p_cursor_activity timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_page_size integer DEFAULT 50
)
 RETURNS TABLE(
   id uuid, item_type text, workspace_id uuid, funnel_item_id uuid, name text,
   program_id uuid, program_name text, stage text, health_score text,
   priority_level text, startup_category text, owner_id uuid, owner_name text,
   last_activity_at timestamp with time zone, next_meeting_at timestamp with time zone,
   created_at timestamp with time zone, updated_at timestamp with time zone,
   has_startup_portugal_status boolean, startup_portugal_document_path text,
   total_count bigint, next_cursor_activity timestamp with time zone, next_cursor_id uuid
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      GREATEST(
        w.updated_at,
        COALESCE((SELECT max(completed_at) FROM public.sessions
                   WHERE workspace_id = w.id AND status = 'completed'), 'epoch'::timestamptz),
        COALESCE((SELECT max(created_at) FROM public.consultant_notes
                   WHERE workspace_id = w.id), 'epoch'::timestamptz),
        COALESCE((SELECT max(m.created_at) FROM public.messages m
                   JOIN public.conversations c ON c.id = m.conversation_id
                   WHERE c.workspace_id = w.id), 'epoch'::timestamptz)
      ) AS last_activity_at,
      (SELECT min(scheduled_at) FROM public.sessions
        WHERE workspace_id = w.id
          AND status = 'scheduled'
          AND scheduled_at > now()) AS next_meeting_at,
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
      -- Surface contracted-but-not-provisioned leads with a distinct stage
      -- label so staff can act on them from the ecosystem view.
      CASE WHEN f.stage::text = 'contracted' THEN 'awaiting_workspace'
           ELSE f.stage::text END AS stage,
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
      AND f.stage::text NOT IN ('lost','disqualified')
      AND (p_program_id IS NULL OR f.program_id = p_program_id)
      AND (
        p_stage IS NULL
        OR (p_stage = 'awaiting_workspace' AND f.stage::text = 'contracted')
        OR f.stage::text = p_stage
      )
      AND (p_owner_id IS NULL OR f.owner_consultant_id = p_owner_id)
      AND (p_has_startup_portugal IS NOT TRUE)
      AND (p_search IS NULL OR COALESCE(f.organization_name, f.contact_name, '') ILIKE '%'||p_search||'%')
  ),
  combined AS (
    SELECT * FROM ws WHERE p_owner_id IS NULL OR owner_id = p_owner_id
    UNION ALL
    SELECT * FROM fi
  ),
  normalized AS (
    SELECT
      c.*,
      ps.full_name AS owner_name,
      COALESCE(c.last_activity_at, 'epoch'::timestamptz) AS sort_activity
    FROM combined c
    LEFT JOIN public.profiles_safe ps ON ps.id = c.owner_id
  ),
  filtered AS (
    SELECT *
    FROM normalized n
    WHERE p_cursor_id IS NULL
       OR (n.sort_activity, n.id) < (COALESCE(p_cursor_activity, 'epoch'::timestamptz), p_cursor_id)
  ),
  counted AS ( SELECT COUNT(*) AS ct FROM combined ),
  page AS (
    SELECT * FROM filtered
    ORDER BY sort_activity DESC, id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_page_size, 50), 200))
  )
  SELECT
    p.id, p.item_type, p.workspace_id, p.funnel_item_id, p.name,
    p.program_id, p.program_name, p.stage, p.health_score,
    p.priority_level, p.startup_category, p.owner_id, p.owner_name,
    p.last_activity_at, p.next_meeting_at, p.created_at, p.updated_at,
    p.has_startup_portugal_status, p.startup_portugal_document_path,
    (SELECT ct FROM counted) AS total_count,
    p.sort_activity AS next_cursor_activity,
    p.id AS next_cursor_id
  FROM page p;
$function$;

COMMENT ON FUNCTION public.list_ecosystem_items_v2 IS
'Ecosystem list v2 — cursor pagination on (last_activity_at desc, id desc). Health filter excludes leads by design. Contracted funnel_items without workspace surface with stage=awaiting_workspace. Returns total_count for UI.';
