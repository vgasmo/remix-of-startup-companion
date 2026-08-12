import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { PIPELINE_STAGES, type FunnelStage } from '@/constants/funnelStages';
import type { CrmInboxItem } from './useCrmInbox';

// Re-export for backward compatibility
export { PIPELINE_STAGES };

export interface CrmPipelineGroups {
  [key: string]: CrmInboxItem[];
}

interface UseCrmPipelineFilters {
  programId?: string;
  assigneeId?: string;
  search?: string;
  myItemsOnly?: boolean;
  currentUserId?: string;
  /** Optional multi-stage filter (segment). Applied when set; defaults to PIPELINE_STAGES. */
  stages?: FunnelStage[];
}

// Explicit select for funnel_items (P1.2 optimization)
const FUNNEL_ITEM_FIELDS = `
  id, stage, type, owner_consultant_id, program_id,
  contact_name, contact_email, organization_name,
  next_action_at, next_action_description, last_activity_at,
  linked_workspace_id, linked_startup_id, linked_contract_id, deal_value, deal_currency, expected_close_date, win_probability,
  metadata_json, notes, contact_phone, source, first_contact_at,
  created_at, updated_at
`;

export function useCrmPipeline(filters?: UseCrmPipelineFilters) {
  return useQuery({
    queryKey: ['crm-pipeline', filters?.currentUserId ?? null, filters],
    queryFn: async (): Promise<CrmPipelineGroups> => {
      const stagesFilter = filters?.stages && filters.stages.length > 0 ? filters.stages : PIPELINE_STAGES;
      let query = supabase
        .from('funnel_items')
        .select(FUNNEL_ITEM_FIELDS)
        .in('stage', stagesFilter)
        .order('next_action_at', { ascending: true, nullsFirst: false });

      if (filters?.programId) {
        query = query.eq('program_id', filters.programId);
      }
      if (filters?.assigneeId) {
        query = query.eq('owner_consultant_id', filters.assigneeId);
      }
      if (filters?.myItemsOnly && filters?.currentUserId) {
        query = query.eq('owner_consultant_id', filters.currentUserId);
      }
      if (filters?.search) {
        const searchTerm = `%${filters.search}%`;
        query = query.or(`organization_name.ilike.${searchTerm},contact_name.ilike.${searchTerm},contact_email.ilike.${searchTerm}`);
      }

      const { data: items, error } = await query;
      if (error) throw error;

      // Fetch owners
      const ownerIds = [...new Set((items || []).filter(i => i.owner_consultant_id).map(i => i.owner_consultant_id))];
      let owners: Record<string, { id: string; full_name: string | null }> = {};
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles_safe')
          .select('id, full_name')
          .in('id', ownerIds as string[]);
        profiles?.forEach(p => { owners[p.id] = p; });
      }

      // Fetch programs
      const programIds = [...new Set((items || []).filter(i => i.program_id).map(i => i.program_id))];
      let programs: Record<string, { id: string; name: string }> = {};
      if (programIds.length > 0) {
        const { data: progs } = await supabase
          .from('programs')
          .select('id, name')
          .in('id', programIds as string[]);
        progs?.forEach(p => { programs[p.id] = p; });
      }

      const enrichedItems: CrmInboxItem[] = (items || []).map(item => ({
        ...item,
        stage: item.stage as FunnelStage,
        owner: item.owner_consultant_id ? owners[item.owner_consultant_id] || null : null,
        program: item.program_id ? programs[item.program_id] || null : null,
      }));

      // Group by stage
      const groups: CrmPipelineGroups = {};
      PIPELINE_STAGES.forEach(stage => {
        groups[stage] = [];
      });

      enrichedItems.forEach(item => {
        if (groups[item.stage]) {
          groups[item.stage].push(item);
        }
      });

      return groups;
    },
  });
}
