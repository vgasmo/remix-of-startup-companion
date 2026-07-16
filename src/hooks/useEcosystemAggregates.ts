import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import type { EcosystemFilters } from './useEcosystemItems';

/**
 * Ecosystem aggregate metrics returned by the `ecosystem_aggregates_v2` RPC.
 * These totals are computed over the FULL filtered dataset in the database,
 * independent of the cursor page currently loaded on the client.
 */
export interface EcosystemAggregates {
  total_active: number;
  unassigned: number;
  by_incubation_type: Array<{ id: string | null; name: string | null; count: number }>;
  by_tier: Record<string, number>;
  by_consultant: Array<{ consultant_id: string; count: number }>;
  by_modality: Record<string, number>;
  by_program: Array<{ program_id: string | null; program_name: string | null; count: number }>;
  at_risk: number;
}

export function useEcosystemAggregates(filters: EcosystemFilters = {}) {
  return useQuery({
    queryKey: ['ecosystem-aggregates-v2', filters],
    queryFn: async (): Promise<EcosystemAggregates> => {
      const { data, error } = await supabase.rpc('ecosystem_aggregates_v2', {
        p_program_id: filters.programId && filters.programId !== 'all' ? filters.programId : null,
        p_stage: filters.stage && filters.stage !== 'all' ? filters.stage : null,
        p_health: filters.healthScore && filters.healthScore !== 'all' ? filters.healthScore : null,
        p_owner_id: filters.ownerId && filters.ownerId !== 'all' ? filters.ownerId : null,
        p_has_startup_portugal: filters.hasStartupPortugal ? true : null,
        p_search: filters.search?.trim() || null,
        p_building_id: filters.buildingId && filters.buildingId !== 'all' ? filters.buildingId : null,
        p_incubation_type_id: filters.incubationTypeId && filters.incubationTypeId !== 'all' ? filters.incubationTypeId : null,
        p_modality: filters.modality ?? null,
        p_tier: filters.tier ?? null,
      });
      if (error) throw error;
      return (data as unknown as EcosystemAggregates) ?? {
        total_active: 0,
        unassigned: 0,
        by_incubation_type: [],
        by_tier: {},
        by_consultant: [],
        by_modality: {},
        by_program: [],
        at_risk: 0,
      };
    },
  });
}
