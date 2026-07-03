import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import type { Database } from '@/integrations/supabase/types';
import { sendTeamsNotification, getAppUrl } from '@/hooks/useIntegrationTriggers';
import { Json } from '@/integrations/supabase/types';
import { triggerMiniCelebration } from '@/lib/confetti';
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

type ActionStatus = Database['public']['Enums']['action_status'];

// P1.2: Helper to log activity
async function logActivity(action: string, entityType: string, entityId: string, workspaceId: string, metadata?: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from('activity_log').insert({
      user_id: user.id,
      workspace_id: workspaceId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: (metadata || {}) as Json,
    });
  } catch (e) {
    logger.error('Failed to log activity', {}, e);
  }
}

export interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  status: ActionStatus;
  priority: string | null;
  due_date: string | null;
  owner_user_id: string | null;
  session_id: string | null;
  milestone_id: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  source_deliverable_key: string | null;
  owner: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export function useActionItems(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['action-items', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('action_items')
        .select('id, title, description, status, priority, due_date, owner_user_id, session_id, milestone_id, workspace_id, created_at, updated_at, completed_at, created_by, planner_sync_status, source_deliverable_key')
        .eq('workspace_id', workspaceId)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      
      // Fetch owner profiles separately
      const ownerIds = [...new Set(data?.filter(a => a.owner_user_id).map(a => a.owner_user_id) || [])];
      let profiles: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
      
      if (ownerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles_safe')
          .select('id, full_name, avatar_url')
          .in('id', ownerIds as string[]);
        profiles = profilesData || [];
      }

      return (data || []).map(item => ({
        ...item,
        owner: item.owner_user_id 
          ? profiles.find(p => p.id === item.owner_user_id) || null 
          : null,
      })) as ActionItem[];
    },
    enabled: !!workspaceId,
  });
}

export function useUpdateActionItem(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      ...updates 
    }: { 
      id: string; 
      status?: ActionStatus;
      due_date?: string | null;
      owner_user_id?: string | null;
      title?: string;
      description?: string | null;
      priority?: string;
    }) => {
      const updateData: Record<string, unknown> = { ...updates };
      
      // Set completed_at when marking as completed
      if (updates.status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (updates.status) {
        updateData.completed_at = null;
      }

      // Capture previous status for notification routing
      const { data: prevRow } = await supabase
        .from('action_items')
        .select('status, workspace_id, title, owner_user_id, created_by')
        .eq('id', id)
        .maybeSingle();
      const prevStatus = prevRow?.status as ActionStatus | undefined;

      const { data, error } = await supabase
        .from('action_items')
        .update(updateData)
        .eq('id', id)
        .select('*, owner:profiles!action_items_owner_user_id_fkey(full_name)')
        .single();

      if (error) throw error;

      // Founder → Consultant: awaiting_validation notification
      if (updates.status === 'awaiting_validation' && prevStatus !== 'awaiting_validation') {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: ws } = await supabase
            .from('workspaces')
            .select('assigned_consultor_id, startup:startups(name)')
            .eq('id', workspaceId)
            .maybeSingle();
          const consultantId = (ws as any)?.assigned_consultor_id;
          if (consultantId && consultantId !== user?.id) {
            let founderName = 'O founder';
            if (user?.id) {
              const { data: p } = await supabase.from('profiles_safe').select('full_name').eq('id', user.id).maybeSingle();
              founderName = p?.full_name || founderName;
            }
            await supabase.from('notifications').insert({
              user_id: consultantId,
              type: 'system',
              title: t('notifications.actionAwaitingValidationTitle', 'Ação para validar'),
              message: t('notifications.actionAwaitingValidationBody', {
                founder: founderName, action: data.title,
                defaultValue: `${founderName} concluiu «${data.title}»`,
              }),
              link: `/workspace/${workspaceId}?tab=milestones-actions&sub=actions&highlight=${data.id}`,
              entity_type: 'action_item',
              entity_id: data.id,
              read: false,
            });
          }
        } catch (e) {
          logger.warn('awaiting_validation_notify_failed', { error: String(e) });
        }
      }

      // Staff → Founder: completed validation notification
      if (updates.status === 'completed' && prevStatus === 'awaiting_validation') {
        try {
          const targetUserId = (prevRow as any)?.owner_user_id || (prevRow as any)?.created_by;
          if (targetUserId) {
            await supabase.from('notifications').insert({
              user_id: targetUserId,
              type: 'system',
              title: t('notifications.actionValidatedTitle', 'Ação validada'),
              message: t('notifications.actionValidatedBody', {
                action: data.title,
                defaultValue: `«${data.title}» foi validada ✓`,
              }),
              link: `/workspace/${workspaceId}?tab=milestones-actions&sub=actions&highlight=${data.id}`,
              entity_type: 'action_item',
              entity_id: data.id,
              read: false,
            });
          }
        } catch (e) {
          logger.warn('action_validated_notify_failed', { error: String(e) });
        }
      }

      // Track if owner was assigned for Teams notification
      const ownerAssigned = 'owner_user_id' in updates && updates.owner_user_id;
      return { data, ownerAssigned, title: data.title };
    },
    // ── Optimistic Update ──
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['action-items', workspaceId] });
      const previousItems = queryClient.getQueryData<ActionItem[]>(['action-items', workspaceId]);

      queryClient.setQueryData<ActionItem[]>(['action-items', workspaceId], (old) => {
        if (!old) return old;
        return old.map((item) =>
          item.id === variables.id
            ? {
                ...item,
                ...variables,
                updated_at: new Date().toISOString(),
                ...(variables.status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
                ...(variables.status && variables.status !== 'completed' ? { completed_at: null } : {}),
              }
            : item,
        );
      });

      return { previousItems };
    },
    onError: (_err, _variables, context) => {
      // Rollback on failure
      if (context?.previousItems) {
        queryClient.setQueryData(['action-items', workspaceId], context.previousItems);
      }
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });

      // P1.2: Log activity
      logActivity('updated', 'action_item', result.data.id, workspaceId, { title: result.title });

      // 🎉 Mini celebration when marking action as completed
      if (result.data.status === 'completed') {
        triggerMiniCelebration();

        // Check if this was their first ever completion
        try {
          const { count } = await supabase
            .from('action_items')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('status', 'completed');

          if (count === 1) {
            const { notify } = await import('@/lib/notify');
            notify.success(t('actions.primeiraAçãoConcluídaOHábito'));
          }
        } catch {
          // Silent - celebration check is non-critical
        }
      }

       // P0.1: Trigger Teams notification when action is assigned to someone
       if (result.ownerAssigned) {
         (async () => {
           const ownerName = (result.data as any)?.owner?.full_name || 'someone';
           let startupName: string | undefined;
           try {
             const { data: ws } = await supabase
               .from('workspaces')
               .select('startup:startups(name)')
               .eq('id', workspaceId)
               .maybeSingle();
             startupName = (ws as any)?.startup?.name || undefined;
           } catch {
             // ignore
           }

           sendTeamsNotification({
             workspaceId,
             eventType: 'action_assigned',
             payload: {
               title: 'Action Item Assigned',
               summary: `"${result.title}" has been assigned to ${ownerName}`,
               startup_name: startupName,
               fields: [{ name: 'Assignee', value: ownerName }],
               link: `${getAppUrl()}/workspace/${workspaceId}?tab=milestones-actions&sub=actions`,
               linkText: 'View Action',
             },
           }).catch((err) => logger.warn('action_assign_notification_failed', { error: String(err) }));
         })().catch((err) => logger.warn('action_assign_notification_wrapper_failed', { error: String(err) }));
       }
    },
  });
}

export function useDeleteActionItem(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (actionId: string) => {
      const { error } = await supabase
        .from('action_items')
        .delete()
        .eq('id', actionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });
    },
  });
}

export function useCreateActionItemFull(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (actionItem: {
      title: string;
      description?: string;
      due_date?: string | null;
      priority?: string;
      owner_user_id?: string | null;
      milestone_id: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('action_items')
        .insert({
          workspace_id: workspaceId,
          title: actionItem.title,
          description: actionItem.description || null,
          due_date: actionItem.due_date || null,
          priority: actionItem.priority || 'medium',
          owner_user_id: actionItem.owner_user_id || null,
          milestone_id: actionItem.milestone_id,
          created_by: user?.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['milestone-actions', variables.milestone_id] });
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
    },
  });
}

export function useActionItemsByMilestone(milestoneId: string | undefined) {
  return useQuery({
    queryKey: ['milestone-actions', milestoneId],
    queryFn: async () => {
      if (!milestoneId) return [];
      
      const { data, error } = await supabase
        .from('action_items')
        .select('*')
        .eq('milestone_id', milestoneId)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      
      // Fetch owner profiles separately
      const ownerIds = [...new Set(data?.filter(a => a.owner_user_id).map(a => a.owner_user_id) || [])];
      let profiles: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
      
      if (ownerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles_safe')
          .select('id, full_name, avatar_url')
          .in('id', ownerIds as string[]);
        profiles = profilesData || [];
      }

      return (data || []).map(item => ({
        ...item,
        owner: item.owner_user_id 
          ? profiles.find(p => p.id === item.owner_user_id) || null 
          : null,
      })) as ActionItem[];
    },
    enabled: !!milestoneId,
  });
}

// Bulk operations
export function useBulkUpdateActions(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ActionStatus }) => {
      const updateData: Record<string, unknown> = { status };
      
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.completed_at = null;
      }

      const { error } = await supabase
        .from('action_items')
        .update(updateData)
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
    },
  });
}

export function useBulkDeleteActions(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('action_items')
        .delete()
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
    },
  });
}
