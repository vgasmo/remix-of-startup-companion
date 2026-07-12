import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { addDays, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';

type StartupStage = Database['public']['Enums']['startup_stage'];

export interface PlaybookItem {
  id: string;
  playbook_id: string;
  item_type: 'milestone' | 'action';
  title: string;
  description: string | null;
  relative_due_days: number | null;
  priority: string | null;
  order_index: number;
  default_owner_role: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface Playbook {
  id: string;
  program_id: string | null;
  stage: StartupStage;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items?: PlaybookItem[];
}

export interface WorkspacePlaybookInstance {
  id: string;
  workspace_id: string;
  playbook_id: string;
  status: 'suggested' | 'instantiated' | 'dismissed' | 'completed';
  instantiated_by: string | null;
  instantiated_at: string | null;
  completed_at: string | null;
  created_at: string;
  playbook?: Playbook;
}

// Get all playbooks
export function usePlaybooks() {
  return useQuery({
    queryKey: ['playbooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playbooks')
        .select('*')
        .order('stage')
        .order('title');

      if (error) throw error;
      return data as Playbook[];
    },
  });
}

// Get playbooks for a specific stage
export function usePlaybooksForStage(stage: StartupStage | undefined, programId?: string) {
  return useQuery({
    queryKey: ['playbooks', 'stage', stage, programId],
    queryFn: async () => {
      let query = supabase
        .from('playbooks')
        .select(`
          *,
          items:playbook_items(*)
        `)
        .eq('stage', stage!)
        .eq('is_active', true)
        .order('title');

      // If programId specified, filter by it or null (global)
      if (programId) {
        query = query.or(`program_id.eq.${programId},program_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []).map(p => ({
        ...p,
        items: ((p.items || []) as unknown as PlaybookItem[]).sort((a, b) => a.order_index - b.order_index),
      })) as Playbook[];
    },
    enabled: !!stage,
  });
}

// Get playbook items
export function usePlaybookItems(playbookId: string | undefined) {
  return useQuery({
    queryKey: ['playbook-items', playbookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playbook_items')
        .select('*')
        .eq('playbook_id', playbookId!)
        .order('order_index');

      if (error) throw error;
      return data as PlaybookItem[];
    },
    enabled: !!playbookId,
  });
}

// Get workspace playbook instances
export function useWorkspacePlaybookInstances(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-playbook-instances', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_playbook_instances')
        .select(`
          *,
          playbook:playbooks(*)
        `)
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as WorkspacePlaybookInstance[];
    },
    enabled: !!workspaceId,
  });
}

// Instantiate a playbook (create milestones and actions) - Staff only
export function useInstantiatePlaybook() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ workspaceId, playbookId }: { workspaceId: string; playbookId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('playbooks.errors.notAuthenticated'));

      // Check if already instantiated
      const { data: existing } = await supabase
        .from('workspace_playbook_instances')
        .select('id, status')
        .eq('workspace_id', workspaceId)
        .eq('playbook_id', playbookId)
        .maybeSingle();

      if (existing?.status === 'instantiated') {
        throw new Error(t('playbooks.errors.alreadyInstantiated'));
      }

      // Get playbook items
      const { data: items, error: itemsError } = await supabase
        .from('playbook_items')
        .select('*')
        .eq('playbook_id', playbookId)
        .order('order_index');

      if (itemsError) throw itemsError;
      if (!items || items.length === 0) {
        throw new Error(t('playbooks.errors.noItems'));
      }

      // Create or update instance
      let instanceId: string;
      if (existing) {
        const { error } = await supabase
          .from('workspace_playbook_instances')
          .update({
            status: 'instantiated',
            instantiated_by: user.id,
            instantiated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
        instanceId = existing.id;
      } else {
        const { data: instance, error } = await supabase
          .from('workspace_playbook_instances')
          .insert({
            workspace_id: workspaceId,
            playbook_id: playbookId,
            status: 'instantiated',
            instantiated_by: user.id,
            instantiated_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        instanceId = instance.id;
      }

      // Separate milestones and actions
      const milestoneItems = items.filter(i => i.item_type === 'milestone');
      const actionItems = items.filter(i => i.item_type === 'action');

      // Create milestones first
      const milestoneMap: Record<string, string> = {}; // ref -> id
      let position = 0;

      for (const item of milestoneItems) {
        const { data: milestone, error } = await supabase
          .from('milestones')
          .insert({
            workspace_id: workspaceId,
            title: item.title,
            description: item.description,
            target_date: item.relative_due_days 
              ? format(addDays(new Date(), item.relative_due_days), 'yyyy-MM-dd')
              : null,
            status: 'not_started',
            position: position++,
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;

        // Store ref for actions to link
        const metadata = item.metadata_json as Record<string, unknown>;
        if (metadata?.ref) {
          milestoneMap[metadata.ref as string] = milestone.id;
        }

        // Create link
        await supabase.from('workspace_playbook_links').insert({
          workspace_playbook_instance_id: instanceId,
          milestone_id: milestone.id,
          playbook_item_id: item.id,
        });
      }

      // Create actions and link to milestones
      for (const item of actionItems) {
        const metadata = item.metadata_json as Record<string, unknown>;
        const milestoneRef = metadata?.milestone_ref as string | undefined;
        const milestoneId = milestoneRef ? milestoneMap[milestoneRef] : null;

        const { data: action, error } = await supabase
          .from('action_items')
          .insert({
            workspace_id: workspaceId,
            milestone_id: milestoneId,
            title: item.title,
            description: item.description,
            due_date: item.relative_due_days 
              ? format(addDays(new Date(), item.relative_due_days), 'yyyy-MM-dd')
              : null,
            priority: item.priority || 'medium',
            status: 'pending',
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;

        // Create link
        await supabase.from('workspace_playbook_links').insert({
          workspace_playbook_instance_id: instanceId,
          action_item_id: action.id,
          playbook_item_id: item.id,
        });
      }

      // Log activity
      await supabase.from('activity_log').insert({
        user_id: user.id,
        workspace_id: workspaceId,
        entity_type: 'playbook',
        entity_id: playbookId,
        action: 'instantiated',
        metadata: {
          playbook_id: playbookId,
          milestones_created: milestoneItems.length,
          actions_created: actionItems.length,
        },
      });

      // Notify workspace consultors/admins that the founder accepted the playbook.
      await notifyPlaybookLifecycle({
        kind: 'accepted',
        workspaceId,
        playbookId,
        instanceId,
        actorId: user.id,
      });

      return { instanceId, milestonesCreated: milestoneItems.length, actionsCreated: actionItems.length };
    },
    onSuccess: (result, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-playbook-instances', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-milestones', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      // Success toast handled in component for customization
    },
    onError: (error: Error) => {
      // Error toast handled in component for customization
      logger.error('Playbook instantiation error', {}, error.message);
    },
  });
}

// Mark a workspace playbook instance as completed/delivered.
export function useCompletePlaybookInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, playbookId, instanceId }: { workspaceId: string; playbookId: string; instanceId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('workspace_playbook_instances')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', instanceId);
      if (error) throw error;

      await notifyPlaybookLifecycle({
        kind: 'completed',
        workspaceId,
        playbookId,
        instanceId,
        actorId: user?.id ?? null,
      });
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-playbook-instances', workspaceId] });
    },
    onError: (error: Error) => {
      logger.error('Playbook complete error', {}, error.message);
    },
  });
}

// Shared: insert inbox notifications for workspace consultors/admins on
// playbook lifecycle transitions (accepted/completed). Best-effort.
async function notifyPlaybookLifecycle(params: {
  kind: 'accepted' | 'completed';
  workspaceId: string;
  playbookId: string;
  instanceId: string;
  actorId: string | null;
}) {
  try {
    const { data: pb } = await supabase
      .from('playbooks')
      .select('title')
      .eq('id', params.playbookId)
      .maybeSingle();
    const { data: ws } = await supabase
      .from('workspaces')
      .select('startup:startups(name)')
      .eq('id', params.workspaceId)
      .maybeSingle();
    const playbookTitle = pb?.title || 'Playbook';
    const startupName = (ws as any)?.startup?.name || 'Workspace';

    const { data: recipients } = await supabase
      .from('workspace_users')
      .select('user_id, role')
      .eq('workspace_id', params.workspaceId)
      .eq('active', true)
      .in('role', ['consultor', 'admin', 'backoffice']);

    const rows = (recipients || [])
      .filter((r) => r.user_id && r.user_id !== params.actorId)
      .map((r) => ({
        user_id: r.user_id as string,
        type: params.kind === 'accepted' ? 'playbook_accepted' : 'playbook_completed',
        title: params.kind === 'accepted'
          ? `Playbook aceite: ${playbookTitle}`
          : `Playbook entregue: ${playbookTitle}`,
        message: `${startupName} — ${params.kind === 'accepted' ? 'o founder aceitou o playbook.' : 'playbook marcado como entregue.'}`,
        link: `/workspace/${params.workspaceId}?tab=playbooks`,
        entity_type: 'playbook_instance',
        entity_id: params.instanceId,
        read: false,
        metadata: { workspace_id: params.workspaceId, playbook_id: params.playbookId },
      }));
    if (rows.length) {
      await supabase.from('notifications').insert(rows);
    }
  } catch (e) {
    logger.warn('notifyPlaybookLifecycle failed', { error: (e as Error)?.message });
  }
}


// Dismiss a playbook suggestion
export function useDismissPlaybook() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ workspaceId, playbookId }: { workspaceId: string; playbookId: string }) => {
      const { data: existing } = await supabase
        .from('workspace_playbook_instances')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('playbook_id', playbookId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('workspace_playbook_instances')
          .update({ status: 'dismissed' })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('workspace_playbook_instances')
          .insert({
            workspace_id: workspaceId,
            playbook_id: playbookId,
            status: 'dismissed',
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-playbook-instances', workspaceId] });
      notify.success(t('playbooks.dismissedSuccess'));
    },
    onError: (error: Error) => {
      notify.error(t('playbooks.errors.dismissFailed'));
      logger.error('Playbook dismiss error', {}, error.message);
    },
  });
}

// Restore a dismissed playbook (undo dismiss)
export function useRestorePlaybook() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ workspaceId, playbookId }: { workspaceId: string; playbookId: string }) => {
      const { data: existing } = await supabase
        .from('workspace_playbook_instances')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('playbook_id', playbookId)
        .eq('status', 'dismissed')
        .maybeSingle();

      if (existing) {
        // Delete the dismissed instance to restore it to "suggested" state
        const { error } = await supabase
          .from('workspace_playbook_instances')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-playbook-instances', workspaceId] });
      notify.success(t('playbooks.restoredSuccess', { defaultValue: 'Playbook restaurado' }));
    },
    onError: (error: Error) => {
      notify.error(t('playbooks.errors.restoreFailed', { defaultValue: 'Falha ao restaurar playbook' }));
      logger.error('Playbook restore error', {}, error.message);
    },
  });
}

// Admin: Create playbook
export function useCreatePlaybook() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (playbook: Omit<Playbook, 'id' | 'created_at' | 'updated_at' | 'items'>) => {
      const payload: Database['public']['Tables']['playbooks']['Insert'] = {
        program_id: playbook.program_id,
        stage: playbook.stage,
        title: playbook.title,
        description: playbook.description,
        is_active: playbook.is_active,
      };
      const { data, error } = await supabase
        .from('playbooks')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      notify.success(t('playbooks.admin.created'));
    },
    onError: (error: Error) => {
      notify.error(t('playbooks.errors.createFailed'));
      logger.error('Playbook create error', {}, error.message);
    },
  });
}

// Admin: Update playbook
export function useUpdatePlaybook() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id, items: _items, ...updates }: Partial<Playbook> & { id: string }) => {
      const payload: Database['public']['Tables']['playbooks']['Update'] = {};
      if (updates.program_id !== undefined) payload.program_id = updates.program_id;
      if (updates.stage !== undefined) payload.stage = updates.stage;
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.is_active !== undefined) payload.is_active = updates.is_active;

      const { data, error } = await supabase
        .from('playbooks')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      notify.success(t('playbooks.admin.updated'));
    },
    onError: (error: Error) => {
      notify.error(t('playbooks.errors.updateFailed'));
      logger.error('Playbook update error', {}, error.message);
    },
  });
}


// Admin: Create playbook item
export function useCreatePlaybookItem() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (item: Omit<PlaybookItem, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('playbook_items')
        .insert([{
          playbook_id: item.playbook_id,
          item_type: item.item_type,
          title: item.title,
          description: item.description,
          relative_due_days: item.relative_due_days,
          priority: item.priority,
          order_index: item.order_index,
          default_owner_role: item.default_owner_role,
          metadata_json: item.metadata_json as unknown as Database['public']['Tables']['playbook_items']['Insert']['metadata_json'],
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['playbook-items', variables.playbook_id] });
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      notify.success(t('playbooks.admin.itemAdded'));
    },
    onError: (error: Error) => {
      notify.error(t('playbooks.errors.itemAddFailed'));
      logger.error('Playbook item create error', {}, error.message);
    },
  });
}

// Admin: Delete playbook item
export function useDeletePlaybookItem() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id, playbookId }: { id: string; playbookId: string }) => {
      const { error } = await supabase
        .from('playbook_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return playbookId;
    },
    onSuccess: (playbookId) => {
      queryClient.invalidateQueries({ queryKey: ['playbook-items', playbookId] });
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      notify.success(t('playbooks.admin.itemRemoved'));
    },
    onError: (error: Error) => {
      notify.error(t('playbooks.errors.itemRemoveFailed'));
      logger.error('Playbook item delete error', {}, error.message);
    },
  });
}
