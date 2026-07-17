/**
 * Hook that fetches key admin dashboard signals:
 * - Pending user approvals count
 * - Contracts expiring within 30 days
 * - Overdue invoices count
 * - Occupancy (active contracts vs total office spaces)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export interface AdminDashboardStats {
  pendingApprovalsCount: number;
  contractRenewals30d: number;
  occupiedSpaces: number;
  totalSpaces: number;
}

export function useAdminDashboardStats() {
  return useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: async (): Promise<AdminDashboardStats> => {
      const [pendingRes, renewalsRes, spacesRes, activeContractsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('account_status', 'pending'),

        supabase
          .from('startup_contracts' as any)
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .lte('end_date', new Date(Date.now() + 30 * 86400000).toISOString())
          .gte('end_date', new Date().toISOString()),

        supabase
          .from('rooms')
          .select('id', { count: 'exact', head: true }),

        supabase
          .from('room_allocations')
          .select('room_id', { count: 'exact', head: true })
          .lte('start_date', new Date().toISOString().slice(0, 10))
          .or(`end_date.is.null,end_date.gte.${new Date().toISOString().slice(0, 10)}`),
      ]);

      // Surface partial failures instead of silently zeroing them out.
      const checks: Array<[string, { error: unknown }]> = [
        ['pendingApprovals', pendingRes],
        ['contractRenewals', renewalsRes],
        ['totalSpaces', spacesRes],
        ['occupiedSpaces', activeContractsRes],
      ];
      for (const [name, res] of checks) {
        if (res.error) {
          logger.warn('admin_dashboard_stat_failed', { stat: name, error: String(res.error) });
        }
      }

      return {
        pendingApprovalsCount: pendingRes.count ?? 0,
        contractRenewals30d: renewalsRes.count ?? 0,
        totalSpaces: spacesRes.count ?? 0,
        occupiedSpaces: activeContractsRes.count ?? 0,
      };
    },
    staleTime: 60_000,
    // Realtime invalidation via useRealtimeWorkspaces replaces polling.
    // Keep a long safety-net refetch to catch missed events.
    refetchInterval: 10 * 60_000,
  });
}
