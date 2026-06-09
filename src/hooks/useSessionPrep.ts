import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export interface SessionPrepData {
  session: {
    id: string;
    title: string;
    scheduled_at: string;
    notes: string | null;
    agenda: string | null;
    ai_summary: string | null;
    ai_decisions: string[] | null;
  };
  previousSessions: {
    id: string;
    title: string;
    scheduled_at: string;
    notes: string | null;
    decisions: string | null;
    ai_summary: string | null;
  }[];
  recentKpis: {
    name: string;
    unit: string | null;
    currentValue: number | null;
    previousValue: number | null;
    trend: 'up' | 'down' | 'stable' | null;
  }[];
  pendingActions: {
    id: string;
    title: string;
    status: string;
    due_date: string | null;
    priority: string | null;
    isOverdue: boolean;
  }[];
  milestones: {
    id: string;
    title: string;
    status: string;
    target_date: string | null;
    isOverdue: boolean;
  }[];
  workspaceTags: string[];
  sessionTags: string[];
}

export function useSessionPrep(sessionId: string | undefined, workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['session-prep', sessionId, workspaceId],
    queryFn: async (): Promise<SessionPrepData | null> => {
      if (!sessionId || !workspaceId) return null;

      const today = new Date().toISOString().split('T')[0];
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      const previousMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7) + '-01';

      // Fetch all data in parallel
      const [
        sessionResult,
        previousSessionsResult,
        currentKpisResult,
        previousKpisResult,
        actionsResult,
        milestonesResult,
        workspaceTagsResult,
        sessionTagsResult,
      ] = await Promise.all([
        // Current session — use maybeSingle so a deleted/RLS-blocked session
        // doesn't reject the whole prep panel; null-guarded below.
        supabase
          .from('sessions')
          .select('id, title, scheduled_at, notes, agenda, ai_summary, ai_decisions')
          .eq('id', sessionId)
          .maybeSingle(),
        
        // Previous 2 sessions
        supabase
          .from('sessions')
          .select('id, title, scheduled_at, notes, decisions, ai_summary')
          .eq('workspace_id', workspaceId)
          .neq('id', sessionId)
          .lt('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: false })
          .limit(2),
        
        // Current month KPIs
        supabase
          .from('kpi_values')
          .select('value, kpi_definition:kpi_definitions(name, unit)')
          .eq('workspace_id', workspaceId)
          .eq('period_month', currentMonth)
          .limit(10),
        
        // Previous month KPIs
        supabase
          .from('kpi_values')
          .select('value, kpi_definition:kpi_definitions(name, unit)')
          .eq('workspace_id', workspaceId)
          .eq('period_month', previousMonth)
          .limit(10),
        
        // Pending/overdue actions (top 5)
        supabase
          .from('action_items')
          .select('id, title, status, due_date, priority')
          .eq('workspace_id', workspaceId)
          .in('status', ['pending', 'in_progress'])
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(5),
        
        // Milestones (next and overdue)
        supabase
          .from('milestones')
          .select('id, title, status, target_date')
          .eq('workspace_id', workspaceId)
          .neq('status', 'completed')
          .order('target_date', { ascending: true, nullsFirst: false })
          .limit(5),
        
        // Workspace tags
        supabase
          .from('workspace_tags')
          .select('tag:tags(name)')
          .eq('workspace_id', workspaceId),
        
        // Session tags
        supabase
          .from('session_tags')
          .select('tag:tags(name)')
          .eq('session_id', sessionId),
      ]);

      if (sessionResult.error || !sessionResult.data) {
        logger.error('Failed to fetch session', {}, sessionResult.error);
        return null;
      }

      // Process KPIs with trend calculation
      const currentKpisMap = new Map<string, { value: number; unit: string | null }>();
      currentKpisResult.data?.forEach((kpi: any) => {
        if (kpi.kpi_definition?.name) {
          currentKpisMap.set(kpi.kpi_definition.name, { 
            value: kpi.value, 
            unit: kpi.kpi_definition.unit 
          });
        }
      });

      const previousKpisMap = new Map<string, number>();
      previousKpisResult.data?.forEach((kpi: any) => {
        if (kpi.kpi_definition?.name) {
          previousKpisMap.set(kpi.kpi_definition.name, kpi.value);
        }
      });

      const recentKpis = Array.from(currentKpisMap.entries()).map(([name, { value, unit }]) => {
        const prevValue = previousKpisMap.get(name);
        let trend: 'up' | 'down' | 'stable' | null = null;
        if (prevValue !== undefined && value !== null) {
          if (value > prevValue) trend = 'up';
          else if (value < prevValue) trend = 'down';
          else trend = 'stable';
        }
        return {
          name,
          unit,
          currentValue: value,
          previousValue: prevValue ?? null,
          trend,
        };
      });

      // Process actions with overdue flag
      const pendingActions = (actionsResult.data || []).map((action: any) => ({
        ...action,
        isOverdue: action.due_date && action.due_date < today,
      }));

      // Process milestones with overdue flag
      const milestones = (milestonesResult.data || []).map((m: any) => ({
        ...m,
        isOverdue: m.target_date && m.target_date < today && m.status !== 'completed',
      }));

      return {
        session: sessionResult.data as SessionPrepData['session'],
        previousSessions: (previousSessionsResult.data || []) as SessionPrepData['previousSessions'],
        recentKpis,
        pendingActions,
        milestones,
        workspaceTags: (workspaceTagsResult.data || []).map((t: any) => t.tag?.name).filter(Boolean),
        sessionTags: (sessionTagsResult.data || []).map((t: any) => t.tag?.name).filter(Boolean),
      };
    },
    enabled: !!sessionId && !!workspaceId,
    staleTime: 60000, // 1 minute
  });
}
