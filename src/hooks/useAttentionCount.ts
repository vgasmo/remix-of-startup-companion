import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

interface AttentionStats {
  criticalCount: number;
  atRiskCount: number;
  overdueCount: number;
  totalAttention: number;
}

export function useAttentionCount() {
  return useQuery({
    queryKey: ['attention-count'],
    queryFn: async (): Promise<AttentionStats> => {
      // Get user's accessible workspaces with health issues
      const { data: workspaces, error: wsError } = await supabase
        .from('workspaces')
        .select('id, health_score, health_score_override')
        .eq('status', 'active');

      if (wsError) throw wsError;

      const workspaceIds = workspaces?.map(w => w.id) || [];
      
      // Count health issues
      let criticalCount = 0;
      let atRiskCount = 0;
      
      workspaces?.forEach(w => {
        const health = w.health_score_override || w.health_score;
        if (health === 'critical') criticalCount++;
        else if (health === 'at_risk') atRiskCount++;
      });

      // Count overdue actions
      let overdueCount = 0;
      if (workspaceIds.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase
          .from('action_items')
          .select('id', { count: 'exact', head: true })
          .in('workspace_id', workspaceIds)
          .in('status', ['pending', 'in_progress'])
          .lt('due_date', today);
        
        overdueCount = count || 0;
      }

      return {
        criticalCount,
        atRiskCount,
        overdueCount,
        totalAttention: criticalCount + atRiskCount + (overdueCount > 0 ? 1 : 0),
      };
    },
    staleTime: 30 * 1000,
    // Realtime (useRealtimeWorkspaces) invalidates this key when
    // workspace_health_alerts / action_items change. Long safety net only.
    refetchInterval: 10 * 60_000,
  });
}
