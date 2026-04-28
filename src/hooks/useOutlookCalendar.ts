import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface OutlookCalendarSettings {
  id: string;
  workspace_id: string;
  enabled: boolean;
  sync_mode: 'webhook' | 'graph';
  webhook_url: string | null;
  graph_tenant_id: string | null;
  graph_client_id: string | null;
  calendar_user_email: string | null;
  use_custom_calendar_email: boolean;
  created_at: string;
  updated_at: string;
}

export function useOutlookSettings(workspaceId?: string) {
  return useQuery({
    queryKey: ['outlook-settings', workspaceId],
    queryFn: async (): Promise<OutlookCalendarSettings | null> => {
      if (!workspaceId) return null;
      
      const { data, error } = await supabase
        .from('outlook_calendar_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      
      if (error) throw error;
      return data as OutlookCalendarSettings | null;
    },
    enabled: !!workspaceId,
  });
}

export function useUpdateOutlookSettings(workspaceId?: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (settings: Partial<OutlookCalendarSettings>) => {
      if (!workspaceId) throw new Error('Workspace ID required');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // SECURITY: Strip any legacy secret key from the payload - secrets are env-only
      const { graph_secret_key: _stripped, ...safeSettings } = settings as Partial<OutlookCalendarSettings> & { graph_secret_key?: unknown };
      
      const upsertData = {
        ...safeSettings,
        workspace_id: workspaceId,
        created_by: user.id,
      };
      
      delete upsertData.id;
      
      const { data, error } = await supabase
        .from('outlook_calendar_settings')
        .upsert(upsertData, { onConflict: 'workspace_id' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outlook-settings', workspaceId] });
    },
  });
}

export function useSyncSessionToOutlook() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ sessionId, action }: { sessionId: string; action: 'create' | 'update' | 'delete' }) => {
      const { data, error } = await supabase.functions.invoke('sync-outlook-calendar', {
        body: { session_id: sessionId, action },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(t('integrations.sessãoSincronizadaComOCalendário'));
      } else if (data.reason === 'not_configured') {
        toast.info(t('integrations.sincronizaçãoOutlookNãoConfiguradaPara'));
      } else {
        toast.warning(data.message || 'Sincronização concluída com avisos');
      }
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error: Error) => {
      toast.error(t('integrations.erroNaSincronizaçãoOutlook', { message: error.message }));
    },
  });
}
