import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface MentorAvailability {
  id: string;
  mentor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
}

export interface MentorBooking {
  id: string;
  mentor_id: string;
  founder_id: string;
  workspace_id: string | null;
  requested_date: string;
  requested_start_time: string;
  requested_end_time: string;
  status: string;
  message: string | null;
  created_at: string;
  mentor?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
  founder?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export function useMentorAvailability(mentorId: string | undefined) {
  return useQuery({
    queryKey: ['mentor-availability', mentorId],
    queryFn: async (): Promise<MentorAvailability[]> => {
      if (!mentorId) return [];
      const { data, error } = await supabase
        .from('mentor_availability')
        .select('*')
        .eq('mentor_id', mentorId)
        .eq('is_active', true)
        .order('day_of_week');
      if (error) throw error;
      return data || [];
    },
    enabled: !!mentorId,
  });
}

export function useMyAvailability() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    // Defense-in-depth: scoping by userId prevents prior-session cache bleed.
    queryKey: ['my-availability', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MentorAvailability[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('mentor_availability')
        .select('*')
        .eq('mentor_id', userId)
        .order('day_of_week');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSetAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slots: Omit<MentorAvailability, 'id' | 'created_at'>[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Delete existing availability
      await supabase
        .from('mentor_availability')
        .delete()
        .eq('mentor_id', user.id);

      // Insert new slots
      if (slots.length > 0) {
        const { error } = await supabase
          .from('mentor_availability')
          .insert(slots.map(s => ({ ...s, mentor_id: user.id })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-availability'] });
    },
  });
}

export function useMyBookings() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ['my-bookings', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MentorBooking[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('mentor_bookings')
        .select('*')
        .or(`mentor_id.eq.${userId},founder_id.eq.${userId}`)
        .order('requested_date', { ascending: true });

      if (error) throw error;
      if (!data?.length) return [];

      // Fetch profiles
      const userIds = [...new Set([...data.map(b => b.mentor_id), ...data.map(b => b.founder_id)])];
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(booking => ({
        ...booking,
        mentor: profileMap.get(booking.mentor_id),
        founder: profileMap.get(booking.founder_id),
      }));
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (booking: {
      mentor_id: string;
      workspace_id?: string;
      requested_date: string;
      requested_start_time: string;
      requested_end_time: string;
      message?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('mentor_bookings')
        .insert([{ ...booking, founder_id: user.id }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    },
  });
}

export function useUpdateBookingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('mentor_bookings')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    },
  });
}
