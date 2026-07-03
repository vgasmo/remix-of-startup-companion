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
        await supabase
          .from('saved_filters')
          .update({ is_default: false })
          .eq('user_id', user.id);
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
