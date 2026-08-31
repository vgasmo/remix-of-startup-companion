import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/**
 * Subscribes to workspace-scoped tables via Supabase Realtime and invalidates
 * the React Query keys that drive stage, health, KPIs and dashboard counts.
 *
 * Replaces the previous polling strategy for:
 *   - `useAttentionCount`      (was refetchInterval 60s)
 *   - `useWorkspaceTabBadges`  (was refetchInterval 120s)
 *   - `useAdminDashboardStats` (was refetchInterval 120s)
 *
 * A single channel handles all tables so we keep exactly one WS connection
 * per authenticated tab. Mount it once (see AppLayout).
 */
export function useRealtimeWorkspaces() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateWorkspaceViews = () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces-paged'] });
      queryClient.invalidateQueries({ queryKey: ['my-pending-workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['ecosystem-items'] });
      queryClient.invalidateQueries({ queryKey: ['ecosystem-items-v2'] });
      queryClient.invalidateQueries({ queryKey: ['ecosystem-aggregates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['attention-count'] });
    };

    const channel = supabase
      .channel('workspaces-stage-health-realtime')
      // Stage / status / health_score / priority — core workspace mutations
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspaces' },
        () => {
          invalidateWorkspaceViews();
        },
      )
      // Membership changes affect who sees which workspace in lists
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspace_users' },
        () => {
          invalidateWorkspaceViews();
        },
      )
      // Stage transitions
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stage_history' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['workspaces'] });
          queryClient.invalidateQueries({ queryKey: ['workspace-stage-timeline'] });
          queryClient.invalidateQueries({ queryKey: ['ecosystem-items'] });
          queryClient.invalidateQueries({ queryKey: ['ecosystem-items-v2'] });
        },
      )
      // Health snapshots feed the health widget + attention counters
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workspace_health_history' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['workspaces'] });
          queryClient.invalidateQueries({ queryKey: ['ecosystem-items-v2'] });
          queryClient.invalidateQueries({ queryKey: ['health-score'] });
          queryClient.invalidateQueries({ queryKey: ['attention-count'] });
        },
      )
      // Health alerts drive the Attention / Work Queue badges
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspace_health_alerts' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['workspace-alerts'] });
          queryClient.invalidateQueries({ queryKey: ['attention-count'] });
          queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
        },
      )
      // KPI updates recompute health & momentum badges
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kpi_values' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['kpis'] });
          queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        },
      )
      // Action items feed the tab badges (pending count) & attention overdue
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_items' },
        (payload) => {
          const wsId =
            (payload.new as { workspace_id?: string } | null)?.workspace_id ??
            (payload.old as { workspace_id?: string } | null)?.workspace_id;
          queryClient.invalidateQueries({ queryKey: ['action-items'] });
          queryClient.invalidateQueries({ queryKey: ['ecosystem-items-v2'] });
          queryClient.invalidateQueries({ queryKey: ['attention-count'] });
          if (wsId) {
            queryClient.invalidateQueries({ queryKey: ['workspace-tab-badges', wsId] });
          } else {
            queryClient.invalidateQueries({ queryKey: ['workspace-tab-badges'] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
