import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface TeamMember {
  id: string;
  startup_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  role: string;
  title: string | null;
  linkedin_url: string | null;
  phone: string | null;
  is_founder: boolean;
  joined_at: string | null;
  left_at: string | null;
  created_at: string;
}

export function useTeamMembers(startupId: string | undefined) {
  return useQuery({
    queryKey: ['team-members', startupId],
    queryFn: async (): Promise<TeamMember[]> => {
      if (!startupId) return [];
      const { data, error } = await supabase
        .from('team_members_safe')
        .select('*')
        .eq('startup_id', startupId)
        .is('left_at', null)
        .order('is_founder', { ascending: false })
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!startupId,
  });
}

export function useCreateTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (member: Omit<TeamMember, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('team_members')
        .insert([member])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['team-members', variables.startup_id] });
    },
  });
}

export function useUpdateTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TeamMember> & { id: string }) => {
      const { error } = await supabase
        .from('team_members')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}

export function useDeleteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}
