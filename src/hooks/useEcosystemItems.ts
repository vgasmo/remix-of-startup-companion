import { useMemo } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
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

interface Cursor {
  activity: string | null;
  id: string | null;
}

const PAGE_SIZE = 50;

// Row → EcosystemItem mapper. v2 returns the same base columns as v1 plus
// pagination markers, so client filters that rely on missing joins
// (building/incubation_type/tags) still fall back to null — matching v1
// behaviour so the UI does not regress.
function mapRow(r: Record<string, unknown>): EcosystemItem {
  return {
    id: r.id as string,
    item_type: r.item_type as 'workspace' | 'lead',
    workspace_id: (r.workspace_id ?? null) as string | null,
    funnel_item_id: (r.funnel_item_id ?? null) as string | null,
    name: (r.name ?? null) as string | null,
    program_id: (r.program_id ?? null) as string | null,
    program_name: (r.program_name ?? null) as string | null,
    stage: (r.stage ?? null) as string | null,
    health_score: (r.health_score ?? null) as string | null,
    priority_level: (r.priority_level ?? null) as string | null,
    startup_category: (r.startup_category ?? null) as string | null,
    owner_id: (r.owner_id ?? null) as string | null,
    owner_name: (r.owner_name ?? null) as string | null,
    space_id: null,
    space_name: null,
    building_id: null,
    building_name: null,
    incubation_type_id: null,
    incubation_type_name: null,
    last_activity_at: (r.last_activity_at ?? null) as string | null,
    next_meeting_at: (r.next_meeting_at ?? null) as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    has_startup_portugal_status: (r.has_startup_portugal_status ?? false) as boolean,
    startup_portugal_document_path: (r.startup_portugal_document_path ?? null) as string | null,
  };
}

/**
 * v2 ecosystem listing with cursor pagination via `list_ecosystem_items_v2`.
 * Returns flattened items across pages plus `totalCount`, `fetchNextPage`,
 * `hasNextPage` etc. from React Query's useInfiniteQuery.
 *
 * The RPC orders by (last_activity_at DESC NULLS LAST, id DESC) and returns
 * `next_cursor_activity` / `next_cursor_id` markers when more rows remain.
 */
export function useEcosystemItems(filters: EcosystemFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: ['ecosystem-items-v2', filters],
    initialPageParam: { activity: null, id: null } as Cursor,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as Cursor;
      const { data, error } = await supabase.rpc('list_ecosystem_items_v2', {
        p_program_id: filters.programId && filters.programId !== 'all' ? filters.programId : null,
        p_stage: filters.stage && filters.stage !== 'all' ? filters.stage : null,
        p_health: filters.healthScore && filters.healthScore !== 'all' ? filters.healthScore : null,
        p_owner_id: filters.ownerId && filters.ownerId !== 'all' ? filters.ownerId : null,
        p_has_startup_portugal: filters.hasStartupPortugal ? true : null,
        p_search: filters.search?.trim() || null,
        p_cursor_activity: cursor.activity,
        p_cursor_id: cursor.id,
        p_page_size: PAGE_SIZE,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const first = rows[0] ?? {};
      const totalCount = Number(first.total_count ?? 0);
      const nextActivity = (first.next_cursor_activity ?? null) as string | null;
      const nextId = (first.next_cursor_id ?? null) as string | null;
      return {
        items: rows.map(mapRow),
        totalCount,
        nextCursor: nextId ? { activity: nextActivity, id: nextId } : null,
      };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.items),
    [query.data],
  );
  const totalCount = query.data?.pages?.[0]?.totalCount ?? 0;

  return {
    // Backward-compat aliases so existing consumers keep working.
    data: items,
    items,
    totalCount,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    error: query.error,
  };
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
