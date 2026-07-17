import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

interface AttentionStats {
  criticalCount: number;
  atRiskCount: number;
  overdueCount: number;
  totalAttention: number;
}

export function useAttentionCount() {
  const { user, isAdmin, isConsultor } = useAuth();
  // Consultants (non-admin) should only see attention counts scoped to their
  // assigned portfolio. Admin/backoffice see the full ecosystem.
  const scopeToAssigned = !!user && isConsultor && !isAdmin;
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ['attention-count', { scopeToAssigned, userId }],
    queryFn: async (): Promise<AttentionStats> => {
      // Determine which workspace IDs count for this user.
      let assignedWorkspaceIds: string[] | null = null;
      if (scopeToAssigned && userId) {
        const [{ data: memberships }, { data: assignedWorkspaces }] = await Promise.all([
          supabase
            .from('workspace_users')
            .select('workspace_id')
            .eq('user_id', userId)
            .eq('role', 'consultor')
            .eq('active', true),
          supabase
            .from('workspaces')
            .select('id')
            .eq('assigned_consultor_id', userId),
        ]);
        assignedWorkspaceIds = [
          ...new Set([
            ...(memberships?.map((m) => m.workspace_id) || []),
            ...(assignedWorkspaces?.map((w) => w.id) || []),
          ]),
        ];

        if (assignedWorkspaceIds.length === 0) {
          return { criticalCount: 0, atRiskCount: 0, overdueCount: 0, totalAttention: 0 };
        }
      }

      let wsQuery = supabase
        .from('workspaces')
        .select('id, health_score, health_score_override')
        .eq('status', 'active');
      if (assignedWorkspaceIds) {
        wsQuery = wsQuery.in('id', assignedWorkspaceIds);
      }
      const { data: workspaces, error: wsError } = await wsQuery;
      if (wsError) throw wsError;

      const workspaceIds = workspaces?.map((w) => w.id) || [];

      let criticalCount = 0;
      let atRiskCount = 0;
      workspaces?.forEach((w) => {
        const health = w.health_score_override || w.health_score;
        if (health === 'critical') criticalCount++;
        else if (health === 'at_risk') atRiskCount++;
      });

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
    enabled: !!userId,
    staleTime: 30 * 1000,
    // Realtime (useRealtimeWorkspaces) invalidates this key when
    // workspace_health_alerts / action_items change. Long safety net only.
    refetchInterval: 10 * 60_000,
  });
}
