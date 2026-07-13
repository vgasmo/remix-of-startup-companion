import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import type { Database } from '@/integrations/supabase/types';
import { triggerMilestoneCelebration } from '@/lib/confetti';

type MilestoneStatus = Database['public']['Enums']['milestone_status'];

export interface Milestone {
  id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  position: number;
  target_date: string | null;
  completed_at: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  source_gate_id: string | null;
  source_week_id: string | null;
  action_count?: number;
  completed_action_count?: number;
}

export function useMilestones(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['milestones', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('milestones')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('position', { ascending: true });

      if (error) throw error;
      
      // Fetch action counts for each milestone
      const milestoneIds = (data || []).map(m => m.id);
      if (milestoneIds.length === 0) return [] as Milestone[];
      
      const { data: actionCounts } = await supabase
        .from('action_items')
        .select('milestone_id, status')
        .in('milestone_id', milestoneIds);
      
      // Calculate counts per milestone
      const countMap = new Map<string, { total: number; completed: number }>();
      (actionCounts || []).forEach(a => {
        if (!a.milestone_id) return;
        const current = countMap.get(a.milestone_id) || { total: 0, completed: 0 };
        current.total++;
        if (a.status === 'completed') current.completed++;
        countMap.set(a.milestone_id, current);
      });
      
      return (data || []).map(m => ({
        ...m,
        action_count: countMap.get(m.id)?.total || 0,
        completed_action_count: countMap.get(m.id)?.completed || 0,
      })) as Milestone[];
    },
    enabled: !!workspaceId,
  });
}

export function useCreateMilestone(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (milestone: {
      title: string;
      description?: string;
      target_date?: string | null;
      position?: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get max position if not provided
      let position = milestone.position;
      if (position === undefined) {
        const { data: existing } = await supabase
          .from('milestones')
          .select('position')
          .eq('workspace_id', workspaceId)
          .order('position', { ascending: false })
          .limit(1);
        position = (existing?.[0]?.position ?? -1) + 1;
      }
      
      const { data, error } = await supabase
        .from('milestones')
        .insert({
          workspace_id: workspaceId,
          title: milestone.title,
          description: milestone.description || null,
          target_date: milestone.target_date || null,
          position,
          created_by: user?.id,
          status: 'not_started',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-milestones', workspaceId] });
    },
  });
}

export function useUpdateMilestone(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      ...updates 
    }: { 
      id: string; 
      title?: string;
      description?: string | null;
      status?: MilestoneStatus;
      target_date?: string | null;
      position?: number;
    }) => {
      const updateData: Record<string, unknown> = { ...updates };
      
      // Set completed_at when marking as completed
      if (updates.status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (updates.status) {
        updateData.completed_at = null;
      }

      const { data, error } = await supabase
        .from('milestones')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    // ── Optimistic Update ──
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['milestones', workspaceId] });
      const previousMilestones = queryClient.getQueryData<Milestone[]>(['milestones', workspaceId]);

      queryClient.setQueryData<Milestone[]>(['milestones', workspaceId], (old) => {
        if (!old) return old;
        return old.map((m) =>
          m.id === variables.id
            ? {
                ...m,
                ...variables,
                updated_at: new Date().toISOString(),
                ...(variables.status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
                ...(variables.status && variables.status !== 'completed' ? { completed_at: null } : {}),
              }
            : m,
        );
      });

      return { previousMilestones };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousMilestones) {
        queryClient.setQueryData(['milestones', workspaceId], context.previousMilestones);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-milestones', workspaceId] });

      // 🎉 Per-completion confetti (existing behaviour)
      if (data.status === 'completed') {
        triggerMilestoneCelebration();

        // 🏆 First-milestone-ever celebration (idempotent via workspace_celebrations).
        // Use upsert with ignoreDuplicates so the second completion doesn't raise
        // a 23505 unique_violation that would surface as a global mutation toast.
        void supabase
          .from('workspace_celebrations')
          .upsert(
            { workspace_id: workspaceId, event_key: 'first_milestone_completed' },
            { onConflict: 'workspace_id,event_key', ignoreDuplicates: true },
          )
          .then(({ error }) => {
            if (error) {
              // Non-critical — never surface to user.
              // eslint-disable-next-line no-console
              console.debug('first_milestone_celebration_skip', error.message);
            }
          });
      }
    },
  });
}

export function useDeleteMilestone(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (milestoneId: string) => {
      const { error } = await supabase
        .from('milestones')
        .delete()
        .eq('id', milestoneId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-milestones', workspaceId] });
    },
  });
}

export function useReorderMilestones(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (milestones: { id: string; position: number }[]) => {
      // Update positions one by one (could be optimized with a batch update)
      for (const m of milestones) {
        const { error } = await supabase
          .from('milestones')
          .update({ position: m.position })
          .eq('id', m.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
    },
  });
}
