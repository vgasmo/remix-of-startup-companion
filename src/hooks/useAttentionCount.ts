import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { countOrThrow } from '@/lib/queryCount';

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
        const { data: assignedWorkspaces, error: assignedError } = await supabase
            .from('workspaces')
            .select('id')
            .eq('assigned_consultor_id', userId);
        if (assignedError) throw assignedError;
        assignedWorkspaceIds = [...new Set(assignedWorkspaces?.map((w) => w.id) || [])];

        if (assignedWorkspaceIds.length === 0) {
          return { criticalCount: 0, atRiskCount: 0, overdueCount: 0, totalAttention: 0 };
        }
      }

      let wsQuery = supabase
        .from('workspaces')
        .select('id, health_score, health_score_override')
        .eq('status', 'active')
        .limit(1000);
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
        // Chunk the id list: 1000 UUIDs in one .in() is a ~38 KB URL. A failed count is an
        // error, never a fabricated 0 (AGENTS.md: failed statistics are errors).
        for (let i = 0; i < workspaceIds.length; i += 100) {
          const ids = workspaceIds.slice(i, i + 100);
          const { data: archived, error: archivedError } = await supabase
            .from('milestones').select('id').in('workspace_id', ids).not('archived_at', 'is', null);
          if (archivedError) throw archivedError;
          let overdueQuery = supabase
            .from('action_items')
            .select('id', { count: 'exact', head: true })
            .in('workspace_id', ids)
            .in('status', ['pending', 'in_progress'])
            .lt('due_date', today);
          if (archived?.length) {
            overdueQuery = overdueQuery.or(`milestone_id.is.null,milestone_id.not.in.(${archived.map(m => m.id).join(',')})`);
          }
          const overdueRes = await overdueQuery;
          overdueCount += countOrThrow(overdueRes);
        }
      }

      return {
        criticalCount,
        atRiskCount,
        overdueCount,
        totalAttention: criticalCount + atRiskCount + (overdueCount > 0 ? 1 : 0),
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Realtime (useRealtimeWorkspaces) invalidates this key when
    // workspace_health_alerts / action_items change. Long safety net only.
    refetchInterval: 10 * 60_000,
  });
}
