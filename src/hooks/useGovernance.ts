import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import i18n from '@/i18n';

export interface SessionWorkflowState {
  session_id: string;
  decisions_done: boolean;
  actions_done: boolean;
  followup_sent: boolean;
  next_session_planned: boolean;
  risks_done: boolean;
  completed_at: string | null;
}

export interface StageGateReview {
  id: string;
  workspace_id: string;
  from_stage: string;
  to_stage: string;
  status: string;
  conditions: string | null;
  evidence_json: any;
  requested_by: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export function useSessionWorkflow(sessionId: string) {
  return useQuery({
    queryKey: ['session-workflow', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_workflow_state')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (error) throw error;
      return data as SessionWorkflowState | null;
    },
    enabled: !!sessionId,
  });
}

export function useUpdateSessionWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, updates }: { sessionId: string; updates: Partial<SessionWorkflowState> }) => {
      // Check if all steps are done
      const allDone = updates.decisions_done && updates.actions_done;
      const completedAt = allDone ? new Date().toISOString() : null;

      const { error } = await supabase
        .from('session_workflow_state')
        .upsert({
          session_id: sessionId,
          ...updates,
          completed_at: completedAt,
        }, { onConflict: 'session_id' });

      if (error) throw error;
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['session-workflow', sessionId] });
      notify.success(i18n.t('common.updated'));
    },
  });
}

export function useStageGateReviews(workspaceId: string) {
  return useQuery({
    queryKey: ['stage-gate-reviews', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_gate_reviews')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('requested_at', { ascending: false });

      if (error) throw error;
      return data as StageGateReview[];
    },
    enabled: !!workspaceId,
  });
}

export function useRequestStageGateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      workspaceId, 
      fromStage, 
      toStage,
      evidence,
    }: { 
      workspaceId: string; 
      fromStage: string; 
      toStage: string;
      evidence?: any;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('stage_gate_reviews')
        .insert({
          workspace_id: workspaceId,
          from_stage: fromStage,
          to_stage: toStage,
          evidence_json: evidence || {},
          requested_by: user?.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      // Create work queue item
      await supabase.from('staff_work_queue_items').insert({
        workspace_id: workspaceId,
        type: 'stage_gate_review',
        title: `Stage Gate Review: ${fromStage} → ${toStage}`,
        description: 'Pedido de revisão de stage gate',
        priority: 'high',
        due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'open',
        evidence_json: { review_id: data.id },
      });

      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['stage-gate-reviews', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['work-queue'] });
      notify.success(i18n.t('common.created'));
    },
  });
}

export function useApproveStageGateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      reviewId, 
      workspaceId,
      status,
      conditions,
    }: { 
      reviewId: string; 
      workspaceId: string;
      status: 'approved' | 'conditional' | 'rejected';
      conditions?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get review details
      const { data: review, error: reviewError } = await supabase
        .from('stage_gate_reviews')
        .select('*')
        .eq('id', reviewId)
        .single();

      if (reviewError) throw reviewError;

      // Update review
      const { error: updateError } = await supabase
        .from('stage_gate_reviews')
        .update({
          status,
          conditions,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reviewId);

      if (updateError) throw updateError;

      // If approved, update workspace stage
      if (status === 'approved') {
        await supabase
          .from('workspaces')
          .update({ stage: review.to_stage as any })
          .eq('id', workspaceId);

        // Log stage change
        await supabase.from('stage_history').insert({
          workspace_id: workspaceId,
          from_stage: review.from_stage,
          to_stage: review.to_stage,
          changed_by: user?.id,
          notes: `Stage gate review approved`,
        });
      }

      // Log activity
      await supabase.from('activity_log').insert({
        workspace_id: workspaceId,
        user_id: user?.id,
        entity_type: 'stage_gate_review',
        entity_id: reviewId,
        action: status,
        metadata: { from_stage: review.from_stage, to_stage: review.to_stage, conditions },
      });

      // Mark work queue item as done
      await supabase
        .from('staff_work_queue_items')
        .update({ status: 'done' })
        .eq('workspace_id', workspaceId)
        .eq('type', 'stage_gate_review')
        .eq('status', 'open');
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['stage-gate-reviews', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['work-queue'] });
      notify.success(i18n.t('common.updated'));
    },
  });
}

export function useStageGateCriteria(programId: string, stage: string) {
  return useQuery({
    queryKey: ['stage-gate-criteria', programId, stage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_gate_criteria')
        .select('*')
        .eq('program_id', programId)
        .eq('stage', stage)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!programId && !!stage,
  });
}
