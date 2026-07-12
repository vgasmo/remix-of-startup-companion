import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface EcosystemItem {
  id: string;
  item_type: 'workspace' | 'lead';
  workspace_id: string | null;
  funnel_item_id: string | null;
  name: string | null;
  program_id: string | null;
  program_name: string | null;
  stage: string | null;
  health_score: string | null;
  priority_level: string | null;
  startup_category: string | null;
  owner_id: string | null;
  owner_name?: string | null;
  space_id: string | null;
  space_name: string | null;
  building_id: string | null;
  building_name: string | null;
  incubation_type_id: string | null;
  incubation_type_name: string | null;
  last_activity_at: string | null;
  next_meeting_at: string | null;
  created_at: string;
  updated_at: string;
  // Computed stats
  pending_actions_count?: number;
  overdue_actions_count?: number;
  has_current_month_kpi?: boolean;
  contract_expires_soon?: boolean;
  has_startup_portugal_status?: boolean;
  startup_portugal_document_path?: string | null;
  tags?: Array<{ id: string; name: string; color: string | null; category_id: string | null }>;
}

export interface EcosystemFilters {
  search?: string;
  programId?: string;
  stage?: string;
  healthScore?: string;
  ownerId?: string;
  buildingId?: string;
  incubationTypeId?: string;
  categoryId?: string;
  tagId?: string;
  needsAttention?: boolean;
  hasStartupPortugal?: boolean;
}

export function useEcosystemItems(filters: EcosystemFilters = {}) {
  return useQuery({
    queryKey: ['ecosystem-items', filters],
    queryFn: async (): Promise<EcosystemItem[]> => {
      // Single-call RPC: joins workspaces + funnel items + owner names + program names server-side.
      // Replaces the previous 5-round-trip client-side aggregation.
      const { data, error } = await supabase.rpc('list_ecosystem_items', {
        p_program_id: filters.programId && filters.programId !== 'all' ? filters.programId : null,
        p_stage: filters.stage && filters.stage !== 'all' ? filters.stage : null,
        p_health: filters.healthScore && filters.healthScore !== 'all' ? filters.healthScore : null,
        p_owner_id: filters.ownerId && filters.ownerId !== 'all' ? filters.ownerId : null,
        p_has_startup_portugal: filters.hasStartupPortugal ? true : null,
        p_search: filters.search?.trim() || null,
        p_limit: 1000,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        item_type: r.item_type,
        workspace_id: r.workspace_id,
        funnel_item_id: r.funnel_item_id,
        name: r.name,
        program_id: r.program_id,
        program_name: r.program_name,
        stage: r.stage,
        health_score: r.health_score,
        priority_level: r.priority_level,
        startup_category: r.startup_category,
        owner_id: r.owner_id,
        owner_name: r.owner_name,
        space_id: null,
        space_name: null,
        building_id: null,
        building_name: null,
        incubation_type_id: null,
        incubation_type_name: null,
        last_activity_at: r.last_activity_at,
        next_meeting_at: r.next_meeting_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
        has_startup_portugal_status: r.has_startup_portugal_status ?? false,
        startup_portugal_document_path: r.startup_portugal_document_path,
      })) as EcosystemItem[];
    },
  });
}

export function useTagCategories() {
  return useQuery({
    queryKey: ['tag-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tag_categories')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useTagsByCategory(categoryId?: string) {
  return useQuery({
    queryKey: ['tags-by-category', categoryId],
    queryFn: async () => {
      let query = supabase.from('tags').select('*, category:tag_categories(name, slug)').order('name');
      if (categoryId && categoryId !== 'all') {
        query = query.eq('category_id', categoryId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
