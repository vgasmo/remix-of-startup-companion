import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { lisbonWallClockToUtcIso } from '@/lib/dateUtils';

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

async function safeNotify(payload: {
  user_id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  entity_type?: string;
  entity_id?: string;
}) {
  try {
    await supabase.from('notifications').insert({ ...payload, read: false });
  } catch {
    /* best-effort */
  }
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

      // Mentor notification for the new booking request is emitted by a
      // database trigger on `mentor_bookings` insert. The client-side
      // safeNotify() previously here duplicated that row and forced founders
      // to look up the mentor's name from `profiles_safe` on every booking —
      // an unnecessary read that occasionally showed a stale name.
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
      // Fetch booking pre-update
      const { data: booking, error: fetchErr } = await supabase
        .from('mentor_bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      const { error } = await supabase
        .from('mentor_bookings')
        .update({ status })
        .eq('id', id);
      if (error) throw error;

      if (!booking) return;

      // Mentor name lookup
      let mentorName = 'o mentor';
      try {
        const { data: prof } = await supabase
          .from('profiles_safe')
          .select('full_name, email')
          .eq('id', booking.mentor_id)
          .maybeSingle();
        mentorName = prof?.full_name || prof?.email || mentorName;
      } catch { /* ignore */ }

      if (status === 'accepted') {
        // Create session row so it appears in calendars/prep. Interpret the
        // booking wall-clock as Europe/Lisbon (canonical) so the session and
        // any downstream Outlook/Teams sync land at the exact requested time,
        // regardless of the mentor's browser locale.
        try {
          const startTime = booking.requested_start_time.slice(0, 5); // HH:mm
          const startIso = lisbonWallClockToUtcIso(`${booking.requested_date}T${startTime}`);
          const [sh, sm] = booking.requested_start_time.split(':').map(Number);
          const [eh, em] = booking.requested_end_time.split(':').map(Number);
          const durationMin = Math.max(15, (eh * 60 + em) - (sh * 60 + sm));
          if (booking.workspace_id) {
            await supabase.from('sessions').insert({
              workspace_id: booking.workspace_id,
              title: `Sessão de mentoria com ${mentorName}`,
              scheduled_at: startIso,
              duration: durationMin,
              created_by: booking.mentor_id,
              source: 'mentor_booking',
              session_type: 'mentoring',
            });
          }
        } catch (e) {
          // don't fail the accept if session insert bounces
        }
      }
      // Founder-facing notifications for accepted/declined are emitted by the
      // `trg_notify_mentor_booking_change` trigger on UPDATE — no client-side
      // duplicate here.
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-sessions'] });
    },
  });
}

/**
 * FIX (N4): expose the SECURITY DEFINER `get_mentor_busy_slots` RPC so that
 * cross-founder slot conflicts are hidden from the picker (no PII returned —
 * only busy_date / start_time / end_time). Founder A booking a slot
 * disappears from founder B's picker instead of surfacing as a 23505 after
 * submit.
 */
export function useMentorBusySlots(mentorId: string | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: ['mentor-busy-slots', mentorId, from, to],
    enabled: !!mentorId,
    queryFn: async () => {
      const now = new Date();
      const defaultFrom = from ?? now.toISOString().slice(0, 10);
      const inSixty = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const defaultTo = to ?? inSixty.toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc('get_mentor_busy_slots', {
        p_mentor_id: mentorId!,
        p_from: defaultFrom,
        p_to: defaultTo,
      });
      if (error) throw error;
      return (data as Array<{ busy_date: string; start_time: string; end_time: string }>) || [];
    },
    staleTime: 30_000,
  });
}
