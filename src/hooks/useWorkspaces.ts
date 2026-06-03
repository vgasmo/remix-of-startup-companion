import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { StartupStage, HealthScore, WorkspacePriority } from '@/types/database';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthContext';

export type WorkspaceStatus = 'imported_unclaimed' | 'claimed' | 'pending' | 'active' | 'rejected' | 'archived';
/** All non-rejected statuses — use in admin/backoffice views that need full ecosystem visibility. */
export const ALL_WORKSPACE_STATUSES: WorkspaceStatus[] = ['imported_unclaimed', 'claimed', 'pending', 'active', 'archived'];
export type SortOption = 'updated' | 'urgency' | 'meeting' | 'name' | 'priority';

export interface WorkspaceFilters {
  search?: string;
  programId?: string | 'all';
  stage?: StartupStage | 'all';
  health?: HealthScore | 'all';
  priority?: WorkspacePriority | 'all';
  missingKpi?: boolean;
  overdueActions?: boolean;
  sortBy?: SortOption;
}

export interface WorkspaceWithDetails {
  id: string;
  startup_id: string;
  program_id: string;
  stage: StartupStage;
  health_score: HealthScore | null;
  health_score_override: HealthScore | null;
  health_notes: string | null;
  priority_level: WorkspacePriority;
  priority_notes: string | null;
  current_week: number | null;
  created_at: string;
  updated_at: string;
  startup: {
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
    has_startup_portugal_status?: boolean | null;
  } | null;
  program: {
    id: string;
    name: string;
    program_type: string | null;
  } | null;
  pendingActionsCount: number;
  overdueActionsCount: number;
  hasCurrentMonthKpi: boolean;
  lastKpiMonth: string | null;
  nextMeetingDate: string | null;
  lastSession: {
    id: string;
    title: string;
    scheduled_at: string;
    notes: string | null;
  } | null;
}

export function useWorkspaces(
  filters: WorkspaceFilters = {},
  assignedOnly: boolean = false,
  /** Which workspace statuses to include. Defaults to ['active'] (operational only).
   *  Founders should pass ['active', 'claimed'] to see freshly claimed workspaces. */
  statuses: WorkspaceStatus[] = ['active'],
) {
  return useQuery({
    queryKey: ['workspaces', filters, assignedOnly, statuses.slice().sort().join(',')],
    queryFn: async (): Promise<WorkspaceWithDetails[]> => {
      // If assignedOnly, first get the user's assigned workspace IDs
      let assignedWorkspaceIds: string[] | null = null;
      
      if (assignedOnly) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Get workspaces via workspace_users membership
          const { data: memberships } = await supabase
            .from('workspace_users')
            .select('workspace_id')
            .eq('user_id', user.id)
            .eq('role', 'consultor')
            .eq('active', true);
          
          const membershipIds = memberships?.map(m => m.workspace_id) || [];
          
          // Also get workspaces where this user is the assigned consultant
          const { data: assignedWorkspaces } = await supabase
            .from('workspaces')
            .select('id')
            .eq('assigned_consultor_id', user.id);
          
          const assignedIds = assignedWorkspaces?.map(w => w.id) || [];
          
          // Merge both lists (deduplicate)
          assignedWorkspaceIds = [...new Set([...membershipIds, ...assignedIds])];
        }
      }
      
      // P0.3: Fetch workspaces with only needed columns
      let query = supabase
        .from('workspaces')
        .select(`
          id, startup_id, program_id, stage, status, needs_onboarding,
          health_score, health_score_override, health_notes,
          priority_level, priority_notes, current_week, created_at, updated_at,
          startup:startups(id, name, description, logo_url, has_startup_portugal_status),
          program:programs(id, name, program_type)
        `)
        .in('status', statuses) // Only include requested statuses
        .order('updated_at', { ascending: false });

      // If assignedOnly, filter by assigned workspace IDs
      if (assignedOnly && assignedWorkspaceIds !== null) {
        if (assignedWorkspaceIds.length === 0) {
          return []; // No assigned workspaces
        }
        query = query.in('id', assignedWorkspaceIds);
      }

      // Apply stage filter
      if (filters.stage && filters.stage !== 'all') {
        query = query.eq('stage', filters.stage);
      }

      // Apply program filter
      if (filters.programId && filters.programId !== 'all') {
        query = query.eq('program_id', filters.programId);
      }

      // Apply health filter
      if (filters.health && filters.health !== 'all') {
        query = query.or(`health_score.eq.${filters.health},health_score_override.eq.${filters.health}`);
      }

      // Apply priority filter
      if (filters.priority && filters.priority !== 'all') {
        query = query.eq('priority_level', filters.priority);
      }
      const { data: workspaces, error } = await query;
      if (error) throw error;

      // Get workspace IDs for server-side aggregation
      const workspaceIds = workspaces.map(w => w.id);
      
      if (workspaceIds.length === 0) return [];

      // Use server-side aggregation function
      const { data: stats, error: statsError } = await supabase
        .rpc('get_workspace_stats', { workspace_ids: workspaceIds });

      if (statsError) {
        logger.error('Failed to get workspace stats', {}, statsError);
      }

      // Build lookup map for stats
      const statsMap = new Map(
        (stats || []).map((s: {
          workspace_id: string;
          pending_actions_count: number;
          overdue_actions_count: number;
          has_current_month_kpi: boolean;
          last_kpi_month: string | null;
          next_meeting_date: string | null;
          last_session_id: string | null;
          last_session_title: string | null;
          last_session_scheduled_at: string | null;
          last_session_notes: string | null;
        }) => [s.workspace_id, s])
      );

      // Build result with stats
      const result = workspaces.map(w => {
        const stat = statsMap.get(w.id);
        return {
          ...w,
          priority_level: (w.priority_level || 'standard') as WorkspacePriority,
          startup: w.startup as WorkspaceWithDetails['startup'],
          program: w.program as WorkspaceWithDetails['program'],
          pendingActionsCount: stat?.pending_actions_count || 0,
          overdueActionsCount: stat?.overdue_actions_count || 0,
          hasCurrentMonthKpi: stat?.has_current_month_kpi || false,
          lastKpiMonth: stat?.last_kpi_month || null,
          nextMeetingDate: stat?.next_meeting_date || null,
          lastSession: stat?.last_session_id ? {
            id: stat.last_session_id,
            title: stat.last_session_title || '',
            scheduled_at: stat.last_session_scheduled_at || '',
            notes: stat.last_session_notes || null,
          } : null,
        };
      });

      // Apply search filter (client-side for startup name)
      let filtered = result;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(w => 
          w.startup?.name.toLowerCase().includes(searchLower)
        );
      }

      // Apply missing KPI filter
      if (filters.missingKpi) {
        filtered = filtered.filter(w => !w.hasCurrentMonthKpi);
      }

      // Apply overdue actions filter
      if (filters.overdueActions) {
        filtered = filtered.filter(w => w.overdueActionsCount > 0);
      }

      // Apply sorting
      const healthPriority: Record<string, number> = {
        critical: 0,
        at_risk: 1,
        stable: 2,
        healthy: 3,
        thriving: 4,
      };

      const priorityOrder: Record<WorkspacePriority, number> = {
        star: 0,
        high: 1,
        standard: 2,
        maintenance: 3,
      };

      const sortBy = filters.sortBy || 'updated';
      filtered.sort((a, b) => {
        switch (sortBy) {
          case 'urgency': {
            // Sort by health (critical first), then overdue count
            const aHealth = a.health_score_override || a.health_score || 'stable';
            const bHealth = b.health_score_override || b.health_score || 'stable';
            const healthDiff = healthPriority[aHealth] - healthPriority[bHealth];
            if (healthDiff !== 0) return healthDiff;
            return b.overdueActionsCount - a.overdueActionsCount;
          }
          case 'meeting': {
            // Sort by next meeting (soonest first, null last)
            if (!a.nextMeetingDate && !b.nextMeetingDate) return 0;
            if (!a.nextMeetingDate) return 1;
            if (!b.nextMeetingDate) return -1;
            return new Date(a.nextMeetingDate).getTime() - new Date(b.nextMeetingDate).getTime();
          }
          case 'name':
            return (a.startup?.name || '').localeCompare(b.startup?.name || '');
          case 'priority': {
            // Sort by priority level (star first, then high, standard, maintenance)
            const aPriority = priorityOrder[a.priority_level] ?? 2;
            const bPriority = priorityOrder[b.priority_level] ?? 2;
            if (aPriority !== bPriority) return aPriority - bPriority;
            // Secondary sort by name within same priority
            return (a.startup?.name || '').localeCompare(b.startup?.name || '');
          }
          case 'updated':
          default:
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }
      });

      return filtered;
    },
  });
}

export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: async () => {
      if (!id) return null;
      
      // P0.3: Select only needed columns instead of *
      const { data, error } = await supabase
        .from('workspaces')
        .select(`
          id, startup_id, program_id, stage, stage_id, status,
          health_score, health_score_override, health_status, health_notes,
          priority_level, priority_notes, current_week, needs_onboarding, created_at, updated_at,
          blocked_at, blocked_reason,
          startup:startups(id, name, description, logo_url, website, nif, main_contact_name, main_contact_email, main_contact_phone, has_startup_portugal_status),
          program:programs(id, name, description, program_type)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// usePrograms moved to useAdminData.ts — import from there
export { usePrograms } from '@/hooks/useAdminData';

export interface PendingWorkspace {
  id: string;
  status: string;
  stage: StartupStage;
  created_at: string;
  startup: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  program: {
    id: string;
    name: string;
  } | null;
}

export function useMyPendingWorkspaces() {
  return useQuery({
    queryKey: ['my-pending-workspaces'],
    queryFn: async (): Promise<PendingWorkspace[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get workspace IDs the user is a member of
      const { data: memberships } = await supabase
        .from('workspace_users')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('role', 'founder');

      if (!memberships?.length) return [];

      const workspaceIds = memberships.map(m => m.workspace_id);

      // Get pending workspaces
      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select(`
          id,
          status,
          stage,
          created_at,
          startup:startups(id, name, description),
          program:programs(id, name)
        `)
        .in('id', workspaceIds)
        .eq('status', 'pending');

      if (error) throw error;

      return (workspaces || []).map(w => ({
        ...w,
        startup: w.startup as PendingWorkspace['startup'],
        program: w.program as PendingWorkspace['program'],
      }));
    },
  });
}
