import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useRef } from 'react';

export interface PlaybookProgress {
  activePlaybook: {
    id: string;
    instanceId: string;
    title: string;
    instantiatedAt: string;
  } | null;
  totalActions: number;
  completedActions: number;
  pendingActions: number;
  overdueActions: number;
  nextActionDue: string | null;
  totalMilestones: number;
  completedMilestones: number;
  progressPercent: number;
}

/**
 * Get playbook progress for a workspace.
 * Tracks actions and milestones created by playbooks.
 */
export function usePlaybookProgress(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['playbook-progress', workspaceId],
    queryFn: async (): Promise<PlaybookProgress> => {
      if (!workspaceId) {
        return {
          activePlaybook: null,
          totalActions: 0,
          completedActions: 0,
          pendingActions: 0,
          overdueActions: 0,
          nextActionDue: null,
          totalMilestones: 0,
          completedMilestones: 0,
          progressPercent: 0,
        };
      }

      // Get the most recent instantiated playbook
      const { data: instances } = await supabase
        .from('workspace_playbook_instances')
        .select(`
          id,
          playbook_id,
          instantiated_at,
          playbook:playbooks(id, title)
        `)
        .eq('workspace_id', workspaceId)
        .eq('status', 'instantiated')
        .order('instantiated_at', { ascending: false })
        .limit(1);

      const activeInstance = instances?.[0];
      
      if (!activeInstance) {
        return {
          activePlaybook: null,
          totalActions: 0,
          completedActions: 0,
          pendingActions: 0,
          overdueActions: 0,
          nextActionDue: null,
          totalMilestones: 0,
          completedMilestones: 0,
          progressPercent: 0,
        };
      }

      // Get all links for this playbook instance
      const { data: links } = await supabase
        .from('workspace_playbook_links')
        .select('action_item_id, milestone_id')
        .eq('workspace_playbook_instance_id', activeInstance.id);

      const actionIds = links?.filter(l => l.action_item_id).map(l => l.action_item_id!) || [];
      const milestoneIds = links?.filter(l => l.milestone_id).map(l => l.milestone_id!) || [];

      // Get action stats
      let totalActions = 0;
      let completedActions = 0;
      let pendingActions = 0;
      let overdueActions = 0;
      let nextActionDue: string | null = null;

      if (actionIds.length > 0) {
        const { data: actions } = await supabase
          .from('action_items')
          .select('id, status, due_date')
          .in('id', actionIds);

        const now = new Date();
        totalActions = actions?.length || 0;
        
        actions?.forEach(a => {
          if (a.status === 'completed') {
            completedActions++;
          } else {
            pendingActions++;
            if (a.due_date && new Date(a.due_date) < now) {
              overdueActions++;
            }
            // Track next due
            if (a.due_date && (!nextActionDue || a.due_date < nextActionDue)) {
              nextActionDue = a.due_date;
            }
          }
        });
      }

      // Get milestone stats
      let totalMilestones = 0;
      let completedMilestones = 0;

      if (milestoneIds.length > 0) {
        const { data: milestones } = await supabase
          .from('milestones')
          .select('id, status')
          .in('id', milestoneIds);

        totalMilestones = milestones?.length || 0;
        completedMilestones = milestones?.filter(m => m.status === 'completed').length || 0;
      }

      // Calculate overall progress
      const totalItems = totalActions + totalMilestones;
      const completedItems = completedActions + completedMilestones;
      const progressPercent = totalItems > 0 
        ? Math.round((completedItems / totalItems) * 100) 
        : 0;

      const playbook = activeInstance.playbook as { id: string; title: string } | null;

      return {
        activePlaybook: playbook ? {
          id: playbook.id,
          instanceId: activeInstance.id,
          title: playbook.title,
          instantiatedAt: activeInstance.instantiated_at!,
        } : null,
        totalActions,
        completedActions,
        pendingActions,
        overdueActions,
        nextActionDue,
        totalMilestones,
        completedMilestones,
        progressPercent,
      };
    },
    enabled: !!workspaceId,
  });

  // Auto-complete playbook at 100% — guard with a ref keyed by instance id so
  // we don't issue a redundant update on every re-render after the first write.
  const autoCompletedRef = useRef<string | null>(null);
  useEffect(() => {
    const instanceId = query.data?.activePlaybook?.instanceId;
    if (
      query.data &&
      query.data.progressPercent === 100 &&
      instanceId &&
      query.data.totalActions + query.data.totalMilestones > 0 &&
      autoCompletedRef.current !== instanceId
    ) {
      autoCompletedRef.current = instanceId;
      supabase
        .from('workspace_playbook_instances')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', instanceId)
        .eq('status', 'instantiated')
        .then(({ error }) => {
          if (!error) {
            queryClient.invalidateQueries({ queryKey: ['workspace-playbook-instances', workspaceId] });
            queryClient.invalidateQueries({ queryKey: ['playbook-progress', workspaceId] });
          } else {
            // Reset guard so a real schema/permission fix can be retried later.
            autoCompletedRef.current = null;
          }
        });
    }
  }, [query.data?.progressPercent, query.data?.activePlaybook?.instanceId, workspaceId, queryClient, query.data]);

  return query;
}

/**
 * Check if an action or milestone was created by a playbook.
 */
export function usePlaybookItemSource(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['playbook-item-sources', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { actionSources: new Map(), milestoneSources: new Map() };

      // Get all instances for this workspace
      const { data: instances } = await supabase
        .from('workspace_playbook_instances')
        .select(`
          id,
          playbook:playbooks(title)
        `)
        .eq('workspace_id', workspaceId)
        .eq('status', 'instantiated');

      if (!instances?.length) {
        return { actionSources: new Map(), milestoneSources: new Map() };
      }

      const instanceIds = instances.map(i => i.id);
      const instanceMap = new Map(instances.map(i => [i.id, (i.playbook as { title: string })?.title || 'Playbook']));

      // Get all links
      const { data: links } = await supabase
        .from('workspace_playbook_links')
        .select('workspace_playbook_instance_id, action_item_id, milestone_id')
        .in('workspace_playbook_instance_id', instanceIds);

      const actionSources = new Map<string, string>();
      const milestoneSources = new Map<string, string>();

      links?.forEach(link => {
        const playbookTitle = instanceMap.get(link.workspace_playbook_instance_id) || 'Playbook';
        if (link.action_item_id) {
          actionSources.set(link.action_item_id, playbookTitle);
        }
        if (link.milestone_id) {
          milestoneSources.set(link.milestone_id, playbookTitle);
        }
      });

      return { actionSources, milestoneSources };
    },
    enabled: !!workspaceId,
  });
}
