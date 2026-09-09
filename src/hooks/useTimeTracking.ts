import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface TimeEntry {
  id: string;
  user_id: string;
  workspace_id: string;
  date: string;
  hours: number;
  description: string | null;
  category: string;
  created_at: string;
  workspace?: {
    startup?: { name: string };
  };
}

export function useMyTimeEntries(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['time-entries', 'mine', startDate, endDate],
    queryFn: async (): Promise<TimeEntry[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      let query = supabase
        .from('time_entries')
        .select('*, workspace:workspaces(startup:startups(name))')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      
      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useWorkspaceTimeEntries(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['time-entries', 'workspace', workspaceId],
    queryFn: async (): Promise<TimeEntry[]> => {
      if (!workspaceId) return [];
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });
}

export function useTimeEntrySummary() {
  return useQuery({
    queryKey: ['time-entries', 'summary'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { totalHours: 0, thisMonth: 0, thisWeek: 0, byWorkspace: [] };
      
      const { data, error } = await supabase
        .from('time_entries')
        .select('hours, date, workspace_id, workspace:workspaces(startup:startups(name))')
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0];
      
      const totalHours = data?.reduce((sum, e) => sum + Number(e.hours), 0) || 0;
      const thisMonth = data?.filter(e => e.date >= startOfMonth).reduce((sum, e) => sum + Number(e.hours), 0) || 0;
      const thisWeek = data?.filter(e => e.date >= startOfWeek).reduce((sum, e) => sum + Number(e.hours), 0) || 0;
      
      const byWorkspace = Object.values(
        (data || []).reduce((acc, e) => {
          const ws = e.workspace as any;
          const name = ws?.startup?.name || 'Unknown';
          if (!acc[e.workspace_id]) {
            acc[e.workspace_id] = { workspace_id: e.workspace_id, name, hours: 0 };
          }
          acc[e.workspace_id].hours += Number(e.hours);
          return acc;
        }, {} as Record<string, { workspace_id: string; name: string; hours: number }>)
      );
      
      return { totalHours, thisMonth, thisWeek, byWorkspace };
    },
  });
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: { workspace_id: string; date: string; hours: number; description?: string; category?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('time_entries')
        .insert([{ ...entry, user_id: user.id }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TimeEntry> & { id: string }) => {
      const { error } = await supabase
        .from('time_entries')
        .update(updates as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });
}
