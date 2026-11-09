import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export interface IntegrationError {
  id: string;
  workspace_id: string | null;
  program_id: string | null;
  integration_type: string;
  source?: string | null;
  error_code: string | null;
  error_message: string;
  request_payload: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  // Joined
  workspace?: {
    startup: { name: string } | null;
  } | null;
}

export function useIntegrationErrors(options?: { workspaceId?: string; limit?: number }) {
  const { workspaceId, limit = 50 } = options || {};

  return useQuery({
    queryKey: ['integration-errors', workspaceId, limit],
    queryFn: async (): Promise<IntegrationError[]> => {
      let query = (supabase as any)
        .from('integration_errors')
        .select(`
          *,
          workspace:workspaces(startup:startups(name))
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []) as IntegrationError[];
    },
  });
}

export function useUnresolvedIntegrationErrors() {
  return useQuery({
    queryKey: ['integration-errors', 'unresolved'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('integration_errors')
        .select(`
          *,
          workspace:workspaces(startup:startups(name))
        `)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as IntegrationError[];
    },
  });
}

export function useResolveIntegrationError() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (errorId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('integration_errors')
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', errorId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-errors'] });
    },
  });
}

// Helper to log integration errors (call from edge functions or hooks)
export async function logIntegrationError(params: {
  workspaceId?: string;
  programId?: string;
  integrationType: string;
  errorCode?: string;
  errorMessage: string;
  requestPayload?: Record<string, unknown>;
}) {
  try {
    await (supabase as any).from('integration_errors').insert({
      workspace_id: params.workspaceId || null,
      program_id: params.programId || null,
      integration_type: params.integrationType,
      error_code: params.errorCode || null,
      error_message: params.errorMessage,
      request_payload: params.requestPayload || null,
    });
  } catch (e) {
    logger.error('Failed to log integration error', {}, e);
  }
}
