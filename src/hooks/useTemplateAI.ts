import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import i18n from '@/i18n';
import { logger } from '@/lib/logger';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

export interface AICoachFeedback {
  summary: string;
  strengths: string[];
  gaps: { field: string; why: string; question: string }[];
  assumptions_to_test: { assumption: string; test: string; metric: string }[];
  red_flags: { risk: string; severity: 'low' | 'medium' | 'high'; mitigation: string }[];
  recommended_actions: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    due_in_days: number;
    owner_hint: 'founder' | 'staff';
  }[];
  next_session_agenda: string[];
  kpi_suggestions: { name: string; definition: string; target_hint: string }[];
}

export interface GenerateCoachResponse {
  success: boolean;
  feedback: AICoachFeedback;
  template_name?: string;
  startup_name?: string;
}

// Generate AI Coach feedback for a template instance
export function useGenerateTemplateCoach() {
  const queryClient = useQueryClient();
  const t = (key: string, fallback?: string) => i18n.t(key, fallback);

  return useMutation({
    mutationFn: async ({
      templateInstanceId,
      mode = 'review',
    }: {
      templateInstanceId: string;
      mode?: 'review' | 'actions' | 'kpis';
    }): Promise<GenerateCoachResponse> => {
      const { data, error } = await invokeWithAuth('generate-template-coach', {
        body: { 
          template_instance_id: templateInstanceId,
          mode,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      return data as GenerateCoachResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-instances'] });
      notify.success(t('templates.aiCoachComplete', 'AI Coach analysis complete'));
    },
    onError: (error: Error) => {
      logger.error('[useGenerateTemplateCoach] Error', {}, error);
      if (error.message.includes('429') || error.message.includes('rate limit')) {
        notify.error(t('sessions.rateLimitError', 'Rate limit exceeded. Please try again later.'));
      } else if (error.message.includes('402') || error.message.includes('credits')) {
        notify.error(t('sessions.creditsError', 'AI credits exhausted. Please add credits.'));
      } else {
        notify.error(error.message || t('templates.aiCoachFailed', 'Failed to generate AI feedback'));
      }
    },
  });
}

// Create actions from AI recommendations
export function useCreateActionsFromAI(workspaceId: string) {
  const queryClient = useQueryClient();
  const t = (key: string, fallback?: string, opts?: Record<string, unknown>) => i18n.t(key, { defaultValue: fallback, ...opts });

  return useMutation({
    mutationFn: async (actions: AICoachFeedback['recommended_actions']) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const today = new Date();
      const actionsToCreate = actions.map(action => ({
        workspace_id: workspaceId,
        title: action.title,
        description: action.description,
        priority: action.priority === 'urgent' ? 'high' : action.priority,
        due_date: new Date(today.getTime() + action.due_in_days * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        status: 'pending' as const,
        created_by: user.id,
      }));

      const { data, error } = await supabase
        .from('action_items')
        .insert(actionsToCreate)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });
      notify.success(t('templates.actionsCreatedFromAI', 'Created {{count}} action items from AI recommendations', { count: data.length }));
    },
    onError: (error: Error) => {
      notify.error(error.message || t('actions.failedToCreate', 'Failed to create actions'));
    },
  });
}

// Update template instance with AI feedback
export function useSaveAIFeedback() {
  const queryClient = useQueryClient();
  const t = (key: string, fallback?: string) => i18n.t(key, fallback);

  return useMutation({
    mutationFn: async ({
      instanceId,
      feedback,
      visibility = 'staff',
    }: {
      instanceId: string;
      feedback: AICoachFeedback;
      visibility?: 'staff' | 'shared_with_founder';
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Type assertion needed as column was just added
      const { error } = await (supabase
        .from('template_instances')
        .update({
          ai_feedback_json: feedback,
          ai_feedback_generated_at: new Date().toISOString(),
          ai_feedback_generated_by: user?.id,
          ai_feedback_visibility: visibility,
        } as any)
        .eq('id', instanceId));

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-instances'] });
    },
    onError: (error: Error) => {
      notify.error(error.message || t('templates.aiCoachFailed', 'Failed to save AI feedback'));
    },
  });
}
