import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useEffect } from 'react';
import { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';

export type NotificationType = 
  | 'task_due' 
  | 'task_overdue' 
  | 'next_action_due' 
  | 'next_action_overdue' 
  | 'recap_ready' 
  | 'email_sync_done'
  | 'overdue_escalated'
  | 'system'
  // Automation types
  | 'discount_expiring'
  | 'contract_anniversary'
  | 'founder_inactive'
  | 'contract_expiring'
  | 'checkin_overdue'
  | 'kpi_stale'
  | 'crm_lead_stale'
  | 'milestone_overdue'
  | 'pending_approval'
  | 'intake_stale'
  | 'session_no_notes'
  | 'workspace_no_consultant';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
  metadata: Json | null;
  entity_type: string | null;
  entity_id: string | null;
}

/**
 * De-duplicate `mentor_connection_pending` notifications keyed by connection_id
 * (fallback: mentor_id + founder pair via entity_id). Multiple booking updates
 * for the same founder↔mentor pair can produce repeat pending rows; the founder
 * inbox should only surface the most recent one. Other notification types are
 * returned untouched.
 */
export function dedupePendingMentorConnections(rows: Notification[]): Notification[] {
  const seen = new Set<string>();
  const result: Notification[] = [];
  for (const n of rows) {
    if (n.type === 'mentor_connection_pending') {
      const meta = (n.metadata ?? {}) as Record<string, unknown>;
      const key =
        (typeof meta.connection_id === 'string' && meta.connection_id) ||
        (typeof meta.mentor_id === 'string' && `m:${meta.mentor_id}`) ||
        n.entity_id ||
        n.id;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    result.push(n);
  }
  return result;
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          // Listen for INSERT (new notifications) AND UPDATE (e.g. DB triggers
          // that mark `mentor_connection_pending` as read when the mentor
          // accepts/declines) so the inbox unread count settles immediately.
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Force a network refetch (not just a stale mark) on every
          // INSERT/UPDATE/DELETE so dedupePendingMentorConnections re-runs
          // against fresh rows and duplicate `mentor_connection_pending`
          // items are collapsed before consumers see them.
          queryClient.invalidateQueries({ queryKey: ['notifications', userId], refetchType: 'active' });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Notification[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, type, title, message, link, read, created_at, metadata, entity_type, entity_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as Notification[];
    },
    // Also dedupe on every cache read (optimistic updates, setQueryData,
    // realtime-triggered refetches) so no consumer of this hook can ever
    // observe duplicate pending mentor-connection notifications.
    select: dedupePendingMentorConnections,
  });
}

/**
 * Unread badge counter. Uses a HEAD/count query so the badge is accurate even
 * when the user has more than the 50 notifications the main list caps at.
 * Filtering `useNotifications().length` under-reported once inboxes crossed
 * that threshold. Kept in sync via the same realtime subscription plus
 * mark-read/mark-all/delete mutation invalidations.
 */
export function useUnreadNotificationCount() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { data } = useQuery({
    queryKey: ['notifications-unread-count', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data ?? 0;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useCreateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notification: Omit<Notification, 'id' | 'created_at' | 'read'>) => {
      const { data, error } = await supabase
        .from('notifications')
        .insert([{ ...notification, read: false }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
