import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface Resource {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  file_path: string | null;
  category: string | null;
  tags: string[] | null;
  is_global: boolean;
  program_id: string | null;
  created_by: string | null;
  created_at: string;
  creator?: {
    full_name: string | null;
  };
}

export function useResources(programId?: string | null) {
  return useQuery({
    queryKey: ['resources', programId],
    queryFn: async (): Promise<Resource[]> => {
      let query = supabase
        .from('resources')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (programId) {
        query = query.or(`is_global.eq.true,program_id.eq.${programId}`);
      } else {
        query = query.eq('is_global', true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      if (!data?.length) return [];
      
      const creatorIds = [...new Set(data.filter(r => r.created_by).map(r => r.created_by!))];
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name')
        .in('id', creatorIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return data.map(r => ({
        ...r,
        creator: r.created_by ? profileMap.get(r.created_by) : undefined,
      }));
    },
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resource: { title: string; description?: string; url?: string; category?: string; tags?: string[]; is_global?: boolean; program_id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('resources')
        .insert([{ ...resource, created_by: user.id }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Resource> & { id: string }) => {
      const { error } = await supabase
        .from('resources')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}

export function useDeleteResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('resources')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}
