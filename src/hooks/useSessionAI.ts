import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import i18n from '@/i18n';
import { logger } from '@/lib/logger';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

interface ActionSuggestion {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  suggestedDueInDays?: number;
}

interface Risk {
  risk: string;
  severity: 'low' | 'medium' | 'high';
}

interface KpiPrompt {
  kpiName: string;
  reason: string;
  suggestedAction: string;
}

interface AIOutputs {
  summary: string;
  decisions: string[];
  risks: Risk[];
  actionSuggestions: ActionSuggestion[];
  kpiPrompts: KpiPrompt[];
}

export function useGenerateSessionSummary(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, transcript }: { sessionId: string; transcript?: string }): Promise<AIOutputs> => {
      const { data, error } = await invokeWithAuth('generate-session-summary', {
        body: { sessionId, transcript },
      });

      if (error) {
        logger.error('Generate summary error', {}, error);
        throw new Error(error.message || 'Failed to generate summary');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to generate summary');
      }

      return {
        summary: data.summary,
        decisions: data.decisions || [],
        risks: data.risks || [],
        actionSuggestions: data.actionSuggestions || [],
        kpiPrompts: data.kpiPrompts || [],
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', workspaceId] });
      notify.success(i18n.t('feedback.saved'));
    },
    onError: (error: Error) => {
      notify.error(i18n.t('errors.aiGenerateFailed'));
    },
  });
}

export function useSendSessionFollowup(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      sessionId, 
      recipientEmails,
      includeActions = true,
      includeKpis = true,
    }: { 
      sessionId: string; 
      recipientEmails?: string[];
      includeActions?: boolean;
      includeKpis?: boolean;
    }) => {
      const { data, error } = await invokeWithAuth('send-session-followup', {
        body: { sessionId, recipientEmails, includeActions, includeKpis },
      });

      if (error) {
        logger.error('Send followup error', {}, error);
        throw new Error(error.message || 'Failed to send follow-up');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to send follow-up');
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activity-log', workspaceId] });
      notify.success(i18n.t('feedback.saved'));
    },
    onError: (error: Error) => {
      notify.error(i18n.t('errors.aiFollowupFailed'));
    },
  });
}

export function useApplyActionSuggestions(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      sessionId, 
      suggestions,
    }: { 
      sessionId: string; 
      suggestions: ActionSuggestion[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const actionsToCreate = suggestions.map(suggestion => ({
        workspace_id: workspaceId,
        session_id: sessionId,
        title: suggestion.title,
        description: suggestion.description,
        priority: suggestion.priority,
        due_date: suggestion.suggestedDueInDays 
          ? new Date(Date.now() + suggestion.suggestedDueInDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : null,
        status: 'pending' as const,
        created_by: user.id,
      }));

      const { data, error } = await supabase
        .from('action_items')
        .insert(actionsToCreate)
        .select();

      if (error) {
        logger.error('Create actions error', {}, error);
        throw new Error('Failed to create action items');
      }

      // Clear the suggestions from the session after applying (don't change source)
      await supabase
        .from('sessions')
        .update({ ai_action_suggestions: null })
        .eq('id', sessionId);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions', workspaceId] });
      notify.success(i18n.t('feedback.saved'));
    },
    onError: (error: Error) => {
      notify.error(i18n.t('errors.aiApplyFailed'));
    },
  });
}

export function useUpdateSessionTranscript(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, transcript }: { sessionId: string; transcript: string }) => {
      const { error } = await supabase
        .from('sessions')
        .update({ 
          raw_transcript: transcript,
          source: 'teams_import',
        })
        .eq('id', sessionId);

      if (error) {
        throw new Error('Failed to save transcript');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', workspaceId] });
      notify.success(i18n.t('feedback.saved'));
    },
    onError: (error: Error) => {
      notify.error(i18n.t('errors.aiTranscriptFailed'));
    },
  });
}
