import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthContext';
import type { StartupStage, HealthScore, WorkspacePriority } from '@/types/database';
import type { WorkspaceWithDetails, WorkspaceStatus, SortOption } from '@/hooks/useWorkspaces';

export interface UseWorkspacesPagedArgs {
  search?: string;
  programId?: string | 'all';
  stage?: StartupStage | 'all';
  health?: HealthScore | 'all';
  priority?: WorkspacePriority | 'all';
  sortBy?: SortOption;
  statuses?: WorkspaceStatus[];
  assignedOnly?: boolean;
  page: number; // 1-based
  pageSize: number;
  enabled?: boolean;
}

export interface UseWorkspacesPagedResult {
  rows: WorkspaceWithDetails[];
  totalCount: number;
}

/**
 * Server-paginated workspaces fetch backed by the `search_workspaces_paged` RPC,
 * then enriched with per-row stats via `get_workspace_stats` for the visible page only.
 * Keeps the My Workspaces list view fast even with hundreds of startups.
 */
export function useWorkspacesPaged(args: UseWorkspacesPagedArgs) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const {
    search = '',
    programId = 'all',
    stage = 'all',
    health = 'all',
    priority = 'all',
    sortBy = 'priority',
    statuses = ['active'],
    assignedOnly = false,
    page,
    pageSize,
    enabled = true,
  } = args;

  return useQuery({
    enabled: enabled && !!userId,
    placeholderData: keepPreviousData,
    queryKey: [
      'workspaces-paged',
      userId,
      { search, programId, stage, health, priority, sortBy, statuses: statuses.slice().sort().join(','), assignedOnly, page, pageSize },
    ],
    queryFn: async (): Promise<UseWorkspacesPagedResult> => {
      const offset = Math.max(0, (page - 1) * pageSize);
      const { data, error } = await supabase.rpc('search_workspaces_paged', {
        _statuses: statuses,
        _assigned_to: assignedOnly && userId ? userId : null,
        _search: search?.trim() || null,
        _program_id: programId !== 'all' ? programId : null,
        _stage: stage !== 'all' ? stage : null,
        _health: health !== 'all' ? health : null,
        _priority: priority !== 'all' ? priority : null,
        _sort_by: sortBy,
        _limit: pageSize,
        _offset: offset,
      });
      if (error) throw error;

      const rows = (data || []) as any[];
      const totalCount = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
      if (rows.length === 0) return { rows: [], totalCount };

      const ids = rows.map(r => r.id);
      const { data: stats, error: statsErr } = await supabase.rpc('get_workspace_stats', { workspace_ids: ids });
      if (statsErr) logger.warn('useWorkspacesPaged: stats fetch failed', { statsErr });

      const statsMap = new Map((stats || []).map((s: any) => [s.workspace_id, s]));

      const mapped: WorkspaceWithDetails[] = rows.map(r => {
        const stat: any = statsMap.get(r.id);
        return {
          id: r.id,
          startup_id: r.startup_id,
          program_id: r.program_id,
          stage: r.stage,
          health_score: r.health_score,
          health_score_override: r.health_score_override,
          health_notes: null,
          priority_level: (r.priority_level || 'standard') as WorkspacePriority,
          priority_notes: null,
          current_week: r.current_week,
          created_at: r.created_at,
          updated_at: r.updated_at,
          startup: r.startup_id
            ? {
                id: r.startup_id,
                name: r.startup_name || '',
                description: r.startup_description ?? null,
                logo_url: r.startup_logo_url ?? null,
              }
            : null,
          program: r.program_id
            ? { id: r.program_id, name: r.program_name || '', program_type: r.program_type ?? null }
            : null,
          pendingActionsCount: stat?.pending_actions_count ?? 0,
          overdueActionsCount: stat?.overdue_actions_count ?? 0,
          hasCurrentMonthKpi: stat?.has_current_month_kpi ?? false,
          lastKpiMonth: stat?.last_kpi_month ?? null,
          nextMeetingDate: stat?.next_meeting_date ?? null,
          lastSession: stat?.last_session_id
            ? {
                id: stat.last_session_id,
                title: stat.last_session_title || '',
                scheduled_at: stat.last_session_scheduled_at || '',
                notes: stat.last_session_notes || null,
              }
            : null,
        };
      });

      return { rows: mapped, totalCount };
    },
  });
}
