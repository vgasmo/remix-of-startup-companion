import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface ConsultantTimeOff {
  id: string;
  consultant_id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  reason: string | null;
  created_at: string;
}

/** Own blocked periods (days / hours the consultant does not want meetings). */
export function useMyTimeOff() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ['my-time-off', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ConsultantTimeOff[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('consultant_time_off')
        .select('*')
        .eq('consultant_id', userId)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ConsultantTimeOff[];
    },
  });
}

export function useAddTimeOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { starts_at: string; ends_at: string; all_day: boolean; reason?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('consultant_time_off')
        .insert({
          consultant_id: user.id,
          created_by: user.id,
          starts_at: input.starts_at,
          ends_at: input.ends_at,
          all_day: input.all_day,
          reason: input.reason?.trim() || null,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as ConsultantTimeOff;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-time-off'] });
      queryClient.invalidateQueries({ queryKey: ['consultant-time-off'] });
    },
  });
}

export function useDeleteTimeOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('consultant_time_off').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-time-off'] });
      queryClient.invalidateQueries({ queryKey: ['consultant-time-off'] });
    },
  });
}

/**
 * PII-free blocked windows for a given consultant/mentor, used by booking
 * pickers so blocked days/hours never show up as bookable.
 */
export function useConsultantTimeOff(consultantId: string | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: ['consultant-time-off', consultantId, from, to],
    enabled: !!consultantId,
    staleTime: 30_000,
    queryFn: async () => {
      const now = new Date();
      const defaultFrom = from ?? now.toISOString().slice(0, 10);
      const defaultTo = to ?? new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc('get_consultant_time_off', {
        p_consultant_id: consultantId!,
        p_from: defaultFrom,
        p_to: defaultTo,
      });
      if (error) throw error;
      return (data as Array<{ starts_at: string; ends_at: string; all_day: boolean }>) ?? [];
    },
  });
}
