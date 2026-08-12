/**
 * Data layer for the backoffice command center.
 * Extracted from BackofficeDashboard so the component stays presentational.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { differenceInMonths, differenceInDays, addYears } from 'date-fns';
import type { FloorMap } from '@/hooks/useBackoffice';

export interface ContractWithDetails {
  id: string;
  workspace_id: string;
  start_date: string;
  end_date: string | null;
  status: string;
  monthly_fee: number;
  contract_number: string | null;
  incubation_type: { name: string; contract_type: string | null } | null;
  building: { name: string; city: string | null } | null;
  workspace: { id: string; startup: { name: string } | null } | null;
}

export interface AnniversaryAlert {
  id: string;
  startupName: string;
  startDate: string;
  yearsIncubated: number;
  monthsIncubated: number;
  daysUntilAnniversary: number;
  alertType: 'anniversary' | 'year3' | 'expiring' | 'renewal';
  severity: 'info' | 'warning' | 'critical';
}

/** Floor maps with their parent space's building id (matching by id, not name). */
export function useBackofficeFloorMaps() {
  return useQuery({
    queryKey: ['floor-maps-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('floor_maps')
        .select('*, space:office_spaces!floor_maps_space_id_fkey(building_id)')
        .order('name');
      if (error) throw error;
      return (data as unknown) as (FloorMap & { space?: { building_id: string | null } | null })[];
    },
  });
}

/**
 * Aggregated backoffice command-center data: active contracts, anniversary /
 * expiry alerts, occupancy stats and waiting-list counts.
 */
export function useBackofficeCommandCenter() {
  // Fetch comprehensive dashboard data
  return useQuery({
    queryKey: ['backoffice-command-center'],
    queryFn: async () => {
      const today = new Date();
      
      // Fetch active contracts with all details
      const { data: contracts } = await supabase
        .from('startup_contracts')
        .select(`
          id, workspace_id, start_date, end_date, status, monthly_fee, contract_number,
          incubation_type:incubation_types(name, contract_type),
          building:buildings(name, city),
          workspace:workspaces(id, startup:startups(name))
        `)
        .eq('status', 'active') as { data: ContractWithDetails[] | null };
      
      // Fetch ALL contracts for "requiring attention"
      const { data: attentionContracts } = await supabase
        .from('startup_contracts')
        .select(`
          id, workspace_id, start_date, end_date, status, monthly_fee, contract_number,
          incubation_type:incubation_types(name, contract_type),
          building:buildings(name, city),
          workspace:workspaces(id, startup:startups(name))
        `)
        .in('status', ['draft', 'pending_signature', 'suspended']) as { data: ContractWithDetails[] | null };

      // Fetch room allocations for occupancy stats
      const { data: rooms } = await supabase
        .from('rooms')
        .select('id, status');
      
      // Invoice queries removed — invoicing is not part of this product

      // Fetch waiting list
      const { data: waitingList } = await supabase
        .from('space_waiting_list')
        .select('id, status, priority')
        .eq('status', 'waiting');

      // Calculate anniversaries and alerts
      const alerts: AnniversaryAlert[] = [];
      const contractsByAge: Record<string, number> = {
        'under1year': 0, '1to2years': 0, '2to3years': 0, 'over3years': 0,
      };

      // Contracts expiring in 30 days
      let expiringContractsCount = 0;

      contracts?.forEach(contract => {
        const startDate = new Date(contract.start_date);
        const startupName = contract.workspace?.startup?.name || 'Unknown';
        const monthsIncubated = differenceInMonths(today, startDate);
        const yearsIncubated = Math.floor(monthsIncubated / 12);
        
        if (monthsIncubated < 12) contractsByAge['under1year']++;
        else if (monthsIncubated < 24) contractsByAge['1to2years']++;
        else if (monthsIncubated < 36) contractsByAge['2to3years']++;
        else contractsByAge['over3years']++;
        
        const nextAnniversary = addYears(startDate, yearsIncubated + 1);
        const daysUntilAnniversary = differenceInDays(nextAnniversary, today);
        
        if (yearsIncubated === 2 && monthsIncubated >= 33) {
          alerts.push({ id: contract.id, startupName, startDate: contract.start_date, yearsIncubated: 3, monthsIncubated, daysUntilAnniversary: differenceInDays(addYears(startDate, 3), today), alertType: 'year3', severity: 'critical' });
        } else if (yearsIncubated >= 3) {
          alerts.push({ id: contract.id, startupName, startDate: contract.start_date, yearsIncubated, monthsIncubated, daysUntilAnniversary, alertType: 'year3', severity: 'critical' });
        } else if (daysUntilAnniversary <= 30 && daysUntilAnniversary >= -3) {
          // Include same-day anniversaries (=0) and a small grace window (-3d)
          // so a contract that hit its date over the weekend still lights up
          // the console when staff review on Monday.
          alerts.push({ id: contract.id, startupName, startDate: contract.start_date, yearsIncubated: yearsIncubated + 1, monthsIncubated, daysUntilAnniversary, alertType: 'anniversary', severity: yearsIncubated >= 2 ? 'warning' : 'info' });
        }
        
        if (contract.end_date) {
          const daysUntilExpiry = differenceInDays(new Date(contract.end_date), today);
          if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) expiringContractsCount++;
          if (daysUntilExpiry <= 60 && daysUntilExpiry > 0) {
            alerts.push({ id: contract.id, startupName, startDate: contract.start_date, yearsIncubated, monthsIncubated, daysUntilAnniversary: daysUntilExpiry, alertType: 'expiring', severity: daysUntilExpiry <= 30 ? 'critical' : 'warning' });
          }
        }
      });

      alerts.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] !== severityOrder[b.severity]
          ? severityOrder[a.severity] - severityOrder[b.severity]
          : a.daysUntilAnniversary - b.daysUntilAnniversary;
      });

      const totalMonthlyRevenue = contracts?.reduce((sum, c) => sum + (c.monthly_fee || 0), 0) || 0;
      const occupiedRooms = rooms?.filter(r => r.status === 'occupied').length || 0;
      const availableRooms = rooms?.filter(r => r.status === 'available').length || 0;
      const totalRooms = rooms?.length || 0;
      const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;


      return {
        totalActiveContracts: contracts?.length || 0,
        totalMonthlyRevenue,
        contractsByAge,
        alerts: alerts.slice(0, 10),
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
        occupancyRate,
        occupiedRooms,
        availableRooms,
        totalRooms,
        waitingListCount: waitingList?.length || 0,
        highPriorityWaiting: waitingList?.filter(w => w.priority >= 80).length || 0,
        expiringContractsCount,
        attentionContracts: attentionContracts || [],
      };
    },
  });
}
