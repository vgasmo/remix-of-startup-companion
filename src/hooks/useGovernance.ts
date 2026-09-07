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
      // Read current persisted row so partial toggles are merged correctly
      const { data: current } = await supabase
        .from('session_workflow_state')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();

      const merged = {
        decisions_done: false,
        actions_done: false,
        followup_sent: false,
        next_session_planned: false,
        risks_done: false,
        ...(current ?? {}),
        ...updates,
      } as SessionWorkflowState;

      const allDone =
        merged.decisions_done &&
        merged.actions_done &&
        merged.followup_sent &&
        merged.next_session_planned &&
        merged.risks_done;

      const completedAt = allDone
        ? (current?.completed_at ?? new Date().toISOString())
        : null;

      const { error } = await supabase
        .from('session_workflow_state')
        .upsert({
          session_id: sessionId,
          decisions_done: merged.decisions_done,
          actions_done: merged.actions_done,
          followup_sent: merged.followup_sent,
          next_session_planned: merged.next_session_planned,
          risks_done: merged.risks_done,
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

      // P2.13: the staff work queue item is created server-side by the
      // stage_gate_review_enqueue trigger — founders cannot insert it (RLS).
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
        // M6: verify writes — otherwise the UI claims "advanced" while the stage
        // is still stuck.
        const { error: stageErr } = await supabase
          .from('workspaces')
          .update({ stage: review.to_stage as any })
          .eq('id', workspaceId);
        if (stageErr) throw stageErr;

        const { error: histErr } = await supabase.from('stage_history').insert({
          workspace_id: workspaceId,
          from_stage: review.from_stage,
          to_stage: review.to_stage,
          changed_by: user?.id,
          notes: `Stage gate review approved`,
        });
        if (histErr) throw histErr;
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
