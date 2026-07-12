import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

export interface WorkQueueItem {
  id: string;
  workspace_id: string;
  type: string;
  title: string;
  description: string | null;
  priority: string;
  due_at: string | null;
  status: string;
  assigned_to: string | null;
  created_by: string | null;
  evidence_json: any;
  related_session_id: string | null;
  related_action_id: string | null;
  related_milestone_id: string | null;
  snoozed_until: string | null;
  created_at: string;
  workspace?: {
    startup?: { name: string };
  };
}

export function useWorkQueue(filters?: { status?: string; statuses?: string[]; type?: string; assignedTo?: string; includeDone?: boolean; staleTime?: number }) {
  return useQuery({
    staleTime: filters?.staleTime,
    queryKey: ['work-queue', filters],
    queryFn: async () => {
      let query = supabase
        .from('staff_work_queue_items')
        .select(`
          *,
          workspace:workspaces(startup:startups(name))
        `)
        .order('due_at', { ascending: true });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      } else if (filters?.statuses && filters.statuses.length > 0) {
        query = query.in('status', filters.statuses);
      } else if (filters?.includeDone) {
        query = query.in('status', ['open', 'in_progress', 'done']);
      } else {
        query = query.in('status', ['open', 'in_progress']);
      }
      if (filters?.type) {
        query = query.eq('type', filters.type);
      }
      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as WorkQueueItem[];
    },
  });
}

export function useWorkQueueStats(userId?: string) {
  return useQuery({
    queryKey: ['work-queue-stats', userId],
    queryFn: async () => {
      let query = supabase
        .from('staff_work_queue_items')
        .select('id, status, due_at, priority')
        .in('status', ['open', 'in_progress']);

      if (userId) {
        query = query.eq('assigned_to', userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const today = new Date();
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      return {
        total: data?.length || 0,
        overdue: data?.filter(i => i.due_at && new Date(i.due_at) < today).length || 0,
        dueThisWeek: data?.filter(i => 
          i.due_at && new Date(i.due_at) >= today && new Date(i.due_at) <= weekFromNow
        ).length || 0,
        urgent: data?.filter(i => i.priority === 'urgent').length || 0,
      };
    },
  });
}

export function useUpdateWorkQueueItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WorkQueueItem> }) => {
      const { error } = await supabase
        .from('staff_work_queue_items')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-queue'] });
      queryClient.invalidateQueries({ queryKey: ['work-queue-stats'] });
    },
  });
}

export function useSnoozeWorkQueueItem() {
  const updateItem = useUpdateWorkQueueItem();

  return useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const snoozedUntil = new Date();
      snoozedUntil.setDate(snoozedUntil.getDate() + days);

      return updateItem.mutateAsync({
        id,
        updates: {
          status: 'snoozed',
          snoozed_until: snoozedUntil.toISOString(),
        },
      });
    },
  });
}

export function useMarkWorkQueueItemDone() {
  const updateItem = useUpdateWorkQueueItem();

  return useMutation({
    mutationFn: async (id: string) => {
      return updateItem.mutateAsync({
        id,
        updates: { status: 'done' },
      });
    },
  });
}

export function useRecomputeWorkQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeWithAuth('recompute-work-queue');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-queue'] });
      queryClient.invalidateQueries({ queryKey: ['work-queue-stats'] });
    },
  });
}
