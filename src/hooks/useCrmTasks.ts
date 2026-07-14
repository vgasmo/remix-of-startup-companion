import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { useTranslation } from 'react-i18next';
import type { VisibilityType, TaskStatus, TaskPriority } from './useActivityTimeline';

export type { TaskStatus, TaskPriority } from './useActivityTimeline';

export interface TaskEntry {
  id: string;
  workspace_id: string | null;
  funnel_item_id: string | null;
  activity_type: 'task';
  subject: string | null;
  preview: string | null;
  due_at: string | null;
  status: TaskStatus;
  completed_at: string | null;
  assigned_to: string | null;
  priority: TaskPriority | null;
  visibility: VisibilityType;
  occurred_at: string;
  created_at: string;
}

export function useAddTask() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      workspace_id?: string;
      funnel_item_id?: string;
      subject: string;
      preview?: string;
      due_at?: string;
      assigned_to?: string;
      priority?: TaskPriority;
      visibility?: VisibilityType;
    }) => {
      // G0 fix: workspace_id is nullable on communication_log, so tasks can be
      // added to unconverted leads. Previously threw on the "workspace_id is
      // required" guard even though the column allows null.
      let workspaceId = params.workspace_id;
      if (!workspaceId && params.funnel_item_id) {
        const { data: funnelItem, error: fiError } = await supabase
          .from('funnel_items')
          .select('linked_workspace_id')
          .eq('id', params.funnel_item_id)
          .maybeSingle();
        if (fiError) throw fiError;
        workspaceId = funnelItem?.linked_workspace_id || undefined;
      }

      if (!workspaceId && !params.funnel_item_id) {
        throw new Error('workspace_id or funnel_item_id is required for task entries');
      }

      const { data, error } = await supabase
        .from('communication_log')
        .insert({
          workspace_id: workspaceId ?? null,
          funnel_item_id: params.funnel_item_id,
          activity_type: 'task',
          subject: params.subject,
          preview: params.preview,
          due_at: params.due_at,
          assigned_to: params.assigned_to,
          priority: params.priority,
          visibility: params.visibility || 'staff',
          status: 'open',
        })
        .select()
        .single();

      if (error) throw error;

      // Update funnel_items.next_action_at if task has due_at
      if (params.funnel_item_id && params.due_at) {
        await supabase
          .from('funnel_items')
          .update({ 
            next_action_at: params.due_at,
            next_action_description: params.subject 
          })
          .eq('id', params.funnel_item_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      notify.success(t('crm.taskAdded'));
    },
    onError: () => notify.error(t('crm.taskError')),
  });
}

export function useCompleteTask() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { taskId: string; clearNextAction?: boolean; funnelItemId?: string }) => {
      const { data, error } = await supabase
        .from('communication_log')
        .update({
          status: 'done',
          completed_at: new Date().toISOString(),
        })
        .eq('id', params.taskId)
        .select()
        .single();

      if (error) throw error;

      // Optionally clear next action
      if (params.clearNextAction && params.funnelItemId) {
        await supabase
          .from('funnel_items')
          .update({ next_action_at: null, next_action_description: null })
          .eq('id', params.funnelItemId);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      // G1: the CRM Tarefas tab reads ['crm-tasks-due', filters] — invalidate it too.
      queryClient.invalidateQueries({ queryKey: ['crm-tasks-due'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      notify.success(t('crm.taskCompleted'));
    },
    onError: () => notify.error(t('crm.taskCompleteError')),
  });
}

export function useReopenTask() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { data, error } = await supabase
        .from('communication_log')
        .update({
          status: 'open',
          completed_at: null,
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
      notify.success(t('crm.taskReopened'));
    },
    onError: () => notify.error(t('crm.taskReopenError')),
  });
}

export function useCancelTask() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { data, error } = await supabase
        .from('communication_log')
        .update({
          status: 'canceled',
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
      notify.success(t('crm.taskCanceled'));
    },
    onError: () => notify.error(t('crm.taskCancelError')),
  });
}

export function useUpdateTask() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      subject?: string;
      preview?: string;
      due_at?: string | null;
      assigned_to?: string | null;
      priority?: TaskPriority | null;
      visibility?: VisibilityType;
    }) => {
      const { id, ...updates } = params;
      const { data, error } = await supabase
        .from('communication_log')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
      notify.success(t('crm.taskUpdated'));
    },
    onError: () => notify.error(t('crm.taskUpdateError')),
  });
}
