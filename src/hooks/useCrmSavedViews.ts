import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Json } from '@/integrations/supabase/types';

export type SavedViewType = 'crm' | 'backoffice' | 'ecosystem';

export interface CrmSavedView {
  id: string;
  user_id: string;
  name: string;
  view_type: SavedViewType;
  filters_json: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
}

export function useCrmSavedViews(viewType: SavedViewType = 'crm') {
  return useQuery({
    queryKey: ['crm-saved-views', viewType],
    queryFn: async (): Promise<CrmSavedView[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('saved_filters')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map saved_filters to CrmSavedView shape, filtering by metadata
      return (data || [])
        .filter(f => {
          const filters = f.filters as Record<string, unknown>;
          return (filters?._viewType || 'workspace') === viewType;
        })
        .map(f => ({
          id: f.id,
          user_id: f.user_id,
          name: f.name,
          view_type: viewType,
          filters_json: f.filters as Record<string, unknown>,
          is_default: f.is_default,
          created_at: f.created_at,
        }));
    },
  });
}

export function useSaveCrmView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      viewType: SavedViewType;
      filters: Record<string, unknown>;
      isDefault?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const filtersWithType = { ...params.filters, _viewType: params.viewType };

      if (params.isDefault) {
        // M7: previously cleared is_default on EVERY saved_filter for the user,
        // wiping backoffice/ecosystem default views when setting a CRM default.
        // Load only same-viewType rows and unset those.
        const { data: existing, error: listErr } = await supabase
          .from('saved_filters')
          .select('id, filters')
          .eq('user_id', user.id)
          .eq('is_default', true);
        if (listErr) throw listErr;
        const sameTypeIds = (existing || [])
          .filter(f => (((f.filters as Record<string, unknown>)?._viewType || 'workspace') === params.viewType))
          .map(f => f.id);
        if (sameTypeIds.length > 0) {
          const { error: clearErr } = await supabase
            .from('saved_filters')
            .update({ is_default: false })
            .in('id', sameTypeIds);
          if (clearErr) throw clearErr;
        }
      }

      const { error } = await supabase
        .from('saved_filters')
        .insert([{
          user_id: user.id,
          name: params.name,
          filters: filtersWithType as unknown as Json,
          is_default: params.isDefault || false,
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-saved-views'] });
    },
  });
}

export function useDeleteCrmView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (viewId: string) => {
      const { error } = await supabase
        .from('saved_filters')
        .delete()
        .eq('id', viewId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-saved-views'] });
    },
  });
}
