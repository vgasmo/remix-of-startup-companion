import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import i18n from '@/i18n';
import { invokeWithAuth } from "@/lib/invokeWithAuth";
const t = i18n.t.bind(i18n);

export interface SessionArtifacts {
  summary: string;
  decisions: string[];
  risks: string[];
  next_steps: string[];
}

export interface SessionTranscript {
  id: string;
  session_id: string;
  transcript_text: string | null;
  source: string;
  created_at: string;
}

export function useGenerateSessionArtifacts() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await invokeWithAuth('generate-session-artifacts', {
        body: { session_id: sessionId }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data as {
        success: boolean;
        artifacts: SessionArtifacts;
        actions_created: Array<{ id: string; title: string }>;
      };
    },
    onSuccess: (data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['action-items'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-actions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      notify.success(t('sessions.generatedSummaryAnd', { length: data.actions_created.length }));
    },
    onError: (error: Error) => {
      notify.error(i18n.t('errors.aiGenerateFailed'));
    },
  });
}

export function useSessionTranscripts(sessionId?: string) {
  return useQuery({
    queryKey: ['session-transcripts', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      
      const { data, error } = await supabase
        .from('session_transcripts')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as SessionTranscript[];
    },
    enabled: !!sessionId,
  });
}

export function useAddTranscript() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ sessionId, transcriptText, source = 'manual' }: {
      sessionId: string;
      transcriptText: string;
      source?: string;
    }) => {
      const { data, error } = await supabase
        .from('session_transcripts')
        .insert({
          session_id: sessionId,
          transcript_text: transcriptText,
          source,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session-transcripts', variables.sessionId] });
      notify.success(t('sessions.transcriptAdded'));
    },
    onError: (error: Error) => {
      notify.error(i18n.t('errors.aiTranscriptFailed'));
    },
  });
}
