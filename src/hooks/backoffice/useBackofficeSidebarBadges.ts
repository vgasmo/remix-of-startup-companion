import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/**
 * Sidebar count badges for backoffice/admin nav items.
 * Cheap count-only queries (head: true), 60s staleTime.
 * - expiringContracts: startup_contracts with end_date within the next 60 days.
 * - pendingApprovals: profiles awaiting activation + claim requests pending review.
 */
export function useBackofficeSidebarBadges(enabled: boolean) {
  return useQuery({
    queryKey: ['backoffice', 'sidebar-badges'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date();
      const in60 = new Date(today);
      in60.setDate(in60.getDate() + 60);
      const todayIso = today.toISOString().slice(0, 10);
      const in60Iso = in60.toISOString().slice(0, 10);

      const [{ count: expiring }, { count: pendingProfiles }, { count: pendingClaims }] =
        await Promise.all([
          supabase
            .from('startup_contracts')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .not('end_date', 'is', null)
            .gte('end_date', todayIso)
            .lte('end_date', in60Iso),
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('account_status', 'pending'),
          supabase
            .from('startup_claim_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
        ]);

      return {
        expiringContracts: expiring ?? 0,
        pendingApprovals: (pendingProfiles ?? 0) + (pendingClaims ?? 0),
      };
    },
  });
}
