import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from "@/lib/notify";

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface TeamsIntegrationSettings {
  id: string;
  workspace_id: string | null;
  program_id: string | null;
  enabled: boolean;
  webhook_url: string | null;
  default_channel_name: string | null;
  notify_checkin_submitted: boolean;
  notify_action_assigned: boolean;
  notify_action_overdue: boolean;
  notify_session_created: boolean;
  notify_session_rescheduled: boolean;
  notify_health_alert: boolean;
  created_at: string;
  updated_at: string;
}

export function useTeamsSettings(workspaceId?: string, programId?: string) {
  const isGlobal = !workspaceId && !programId;
  
  return useQuery({
    queryKey: ['teams-settings', workspaceId ?? 'global', programId],
    queryFn: async (): Promise<TeamsIntegrationSettings | null> => {
      let query = supabase
        .from('teams_integration_settings')
        .select('*');
      
      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      } else if (programId) {
        query = query.eq('program_id', programId);
      } else {
        // Global settings: no workspace_id and no program_id
        query = query.is('workspace_id', null).is('program_id', null);
      }
      
      const { data, error } = await query.maybeSingle();
      
      if (error) throw error;
      return data as TeamsIntegrationSettings | null;
    },
  });
}

export function useUpdateTeamsSettings(workspaceId?: string, programId?: string) {
  const queryClient = useQueryClient();
  const isGlobal = !workspaceId && !programId;
  
  return useMutation({
    mutationFn: async (settings: Partial<TeamsIntegrationSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const upsertData: Record<string, any> = {
        ...settings,
        created_by: user.id,
      };
      
      // Set workspace_id or program_id, or keep both null for global
      if (workspaceId) {
        upsertData.workspace_id = workspaceId;
      } else if (programId) {
        upsertData.program_id = programId;
      }
      // For global settings, both remain null
      
      // Remove id from upsert data if present (let DB generate it)
      delete upsertData.id;
      
      // For global settings, we need a different approach since there's no unique constraint on null values
      if (isGlobal) {
        // Check if global settings already exist
        const { data: existing } = await supabase
          .from('teams_integration_settings')
          .select('id')
          .is('workspace_id', null)
          .is('program_id', null)
          .maybeSingle();
        
        if (existing) {
          // Update existing global settings
          const { data, error } = await supabase
            .from('teams_integration_settings')
            .update(upsertData)
            .eq('id', existing.id)
            .select()
            .single();
          
          if (error) throw error;
          return data;
        } else {
          // Insert new global settings
          const { data, error } = await supabase
            .from('teams_integration_settings')
            .insert(upsertData)
            .select()
            .single();
          
          if (error) throw error;
          return data;
        }
      }
      
      const { data, error } = await supabase
        .from('teams_integration_settings')
        .upsert(upsertData, { 
          onConflict: workspaceId ? 'workspace_id' : 'program_id',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams-settings', workspaceId ?? 'global', programId] });
    },
  });
}

export function useTestTeamsWebhook() {
  return useMutation({
    mutationFn: async () => {
      // Test via backend function to avoid browser CORS/header limitations
      const { data: settings, error: settingsError } = await supabase
        .from('teams_integration_settings')
        .select('enabled, webhook_url')
        .is('workspace_id', null)
        .is('program_id', null)
        .maybeSingle();

      if (settingsError) throw settingsError;
      if (!settings?.webhook_url) throw new Error('No Teams webhook configured');

      const { data, error } = await invokeWithAuth('teams-notify', {
        body: {
          event_type: 'test',
          payload: {
            title: 'Teste',
            summary: 'Mensagem de teste do workflow.',
            fields: [
              { name: 'Startup', value: 'Demo Startup' },
              { name: 'Owner', value: 'Vítor' },
              { name: 'Severidade', value: 'info' },
            ],
            link: 'https://example.com',
            link_text: 'Abrir',
            priority: 'low',
          },
        },
      });

      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.error || 'Teams webhook failed');
      }

      return data;
    },
    onSuccess: () => {
      notify.success(t('integrations.testMessageQueuedsentToTeams'));
    },
    onError: (error: Error) => {
      notify.error(t('integrations.testFailed', { message: error.message }));
    },
  });
}
