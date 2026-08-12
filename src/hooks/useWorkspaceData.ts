import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { SESSION_LIST_COLUMNS } from '@/hooks/useSessions';

export function useWorkspaceActions(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-actions', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      // First get action items
      const { data: actions, error } = await supabase
        .from('action_items')
        .select('id, workspace_id, session_id, milestone_id, title, description, status, priority, due_date, owner_user_id, created_by, completed_at, created_at, updated_at, source_deliverable_key')
        .eq('workspace_id', workspaceId)
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(10);

      if (error) throw error;
      if (!actions || actions.length === 0) return [];

      // Get unique owner IDs
      const ownerIds = [...new Set(actions.filter(a => a.owner_user_id).map(a => a.owner_user_id))];
      
      // Fetch profiles separately if there are owners
      let profilesMap: Record<string, any> = {};
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles_safe')
          .select('id, full_name, avatar_url')
          .in('id', ownerIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
        }
      }

      // Combine data
      return actions.map(action => ({
        ...action,
        owner: action.owner_user_id ? profilesMap[action.owner_user_id] || null : null,
      }));
    },
    enabled: !!workspaceId,
  });
}

export function useWorkspaceKpis(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-kpis', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { current: [], previous: [] };
      
      // Get the last 2 months of KPI data
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;

      const [currentResult, previousResult] = await Promise.all([
        supabase
          .from('kpi_values')
          .select(`
            *,
            kpi_definition:kpi_definitions(id, name, unit, direction, category)
          `)
          .eq('workspace_id', workspaceId)
          .eq('period_month', currentMonth),
        supabase
          .from('kpi_values')
          .select(`
            *,
            kpi_definition:kpi_definitions(id, name, unit, direction, category)
          `)
          .eq('workspace_id', workspaceId)
          .eq('period_month', previousMonth)
      ]);

      // Surface partial failures (previously swallowed) without breaking the UI.
      if (currentResult.error) {
        logger.warn('workspace_kpis_current_failed', { workspaceId, error: String(currentResult.error) });
      }
      if (previousResult.error) {
        logger.warn('workspace_kpis_previous_failed', { workspaceId, error: String(previousResult.error) });
      }

      return {
        current: currentResult.data || [],
        previous: previousResult.data || [],
        currentMonth,
        previousMonth
      };
    },
    enabled: !!workspaceId,
  });
}

export function useWorkspaceMilestones(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-milestones', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('milestones')
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)
        .order('position', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });
}

export function useWorkspaceNextSession(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-next-session', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      
      const { data: session } = await supabase
        .from('sessions')
        .select('id, title, scheduled_at, duration, join_url, teams_meeting_url, location, status')
        .eq('workspace_id', workspaceId)
        .gte('scheduled_at', new Date().toISOString())
        .not('status', 'in', '(cancelled,no_show)')
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (session) {
        return {
          id: session.id,
          title: session.title,
          starts_at: session.scheduled_at,
          ends_at: new Date(new Date(session.scheduled_at).getTime() + (session.duration || 60) * 60000).toISOString(),
          join_url: session.join_url ?? session.teams_meeting_url ?? null,
          location: session.location,
        };
      }

      return null;
    },
    enabled: !!workspaceId,
  });
}

export function useWorkspaceSessions(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-sessions', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('sessions')
        .select(SESSION_LIST_COLUMNS)
        .eq('workspace_id', workspaceId)
        .order('scheduled_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });
}

export function useStages(programId: string | undefined) {
  return useQuery({
    queryKey: ['stages', programId],
    queryFn: async () => {
      if (!programId) return [];
      
      const { data, error } = await supabase
        .from('stages')
        .select('*')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      // Default fallback stages use stage_key for i18n resolution (via stages.{key})
      const DEFAULT_STAGES = [
        { id: '1', stage_key: 'ideation', name: 'ideation', order_index: 0 },
        { id: '2', stage_key: 'validation', name: 'validation', order_index: 1 },
        { id: '3', stage_key: 'mvp', name: 'mvp', order_index: 2 },
        { id: '4', stage_key: 'growth', name: 'growth', order_index: 3 },
        { id: '5', stage_key: 'scale', name: 'scale', order_index: 4 },
      ];

      if (error) {
        logger.error('[useStages] Error', {}, error);
        return DEFAULT_STAGES;
      }
      
      if (!data || data.length === 0) {
        return DEFAULT_STAGES;
      }
      
      return data;
    },
    enabled: !!programId,
  });
}
