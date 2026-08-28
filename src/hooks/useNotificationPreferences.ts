import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_digest_enabled: boolean;
  digest_frequency: string;
  digest_day: number;
  last_digest_sent_at: string | null;
  slack_webhook_url: string | null;
  slack_enabled: boolean;
  calendar_sync_enabled: boolean;
  milestone_reminders_enabled: boolean;
  milestone_reminder_days: number;
  /** Staff/consultants: email alerts about founder delays (inactivity, overdue milestones/check-ins, stale KPIs). */
  email_on_founder_delays: boolean;

}

export function useNotificationPreferences() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    // Per-user key prevents cache bleed across session changes.
    queryKey: ['notification-preferences', userId],
    enabled: !!userId,
    queryFn: async (): Promise<NotificationPreferences | null> => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert([{ ...prefs, user_id: userId }], { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences', userId] });
    },
  });
}
