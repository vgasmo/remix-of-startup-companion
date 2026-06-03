import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface GraphApiGlobalSettings {
  tenant_id: string;
  client_id: string;
  // Note: client_secret is NEVER returned to the frontend for security
  // It is only written via edge functions, never read back
}

export interface GlobalIntegrationSettings {
  id: string;
  integration_type: string;
  settings_json: GraphApiGlobalSettings | Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch global Graph settings via secure edge function
 * This NEVER exposes client_secret to the browser
 */
export function useGlobalGraphSettings() {
  return useQuery({
    queryKey: ['global-integration-settings', 'graph_api'],
    queryFn: async (): Promise<GlobalIntegrationSettings | null> => {
      // Use edge function to fetch settings - secrets are sanitized server-side
      const { data, error } = await invokeWithAuth('get-global-integrations', {
        body: { integration_type: 'graph_api' },
      });
      
      if (error) {
        // Non-staff users get 403 — return null silently instead of throwing
        const msg = typeof error === 'object' && error !== null ? (error as any).message || JSON.stringify(error) : String(error);
        if (msg.includes('403') || msg.includes('Access denied')) {
          return null;
        }
        logger.error('[useGlobalGraphSettings] Edge function error', {}, error);
        throw error;
      }
      
      const settings = data?.settings?.[0] || null;
      return settings as GlobalIntegrationSettings | null;
    },
  });
}

/**
 * Update global Graph settings via secure edge function
 * Secrets are handled server-side and never exposed
 */
export function useUpdateGlobalGraphSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (settings: {
      tenant_id: string;
      client_id: string;
      is_enabled?: boolean;
    }) => {
      // Use edge function to save settings - only non-sensitive identifiers
      const { data, error } = await invokeWithAuth('set-global-integrations', {
        body: {
          integration_type: 'graph_api',
          settings: {
            tenant_id: settings.tenant_id,
            client_id: settings.client_id,
          },
          is_enabled: settings.is_enabled ?? true,
        },
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to save settings');
      
      return data.settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-integration-settings', 'graph_api'] });
      notify.success(t('integrations.globalGraphApiSettingsSaved'));
    },
    onError: (error: Error) => {
      notify.error(t('integrations.failedToSaveSettings', { message: error.message }));
    },
  });
}

/**
 * Toggle global Graph API enabled/disabled
 */
export function useToggleGlobalGraph() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      // Fetch current settings first
      const { data: currentData } = await invokeWithAuth('get-global-integrations', {
        body: { integration_type: 'graph_api' },
      });
      
      const current = currentData?.settings?.[0];
      if (!current) throw new Error('No Graph API settings configured');
      
      const currentSettings = current.settings_json as GraphApiGlobalSettings;
      
      // Update with same settings but different enabled state
      const { data, error } = await invokeWithAuth('set-global-integrations', {
        body: {
          integration_type: 'graph_api',
          settings: {
            tenant_id: currentSettings.tenant_id,
            client_id: currentSettings.client_id,
            // Don't send client_secret - it will be preserved server-side
          },
          is_enabled: enabled,
        },
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to update');
      
      return data.settings;
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['global-integration-settings', 'graph_api'] });
      notify.success(enabled ? 'Graph API enabled globally' : 'Graph API disabled');
    },
    onError: (error: Error) => {
      notify.error(t('integrations.failedToUpdate', { message: error.message }));
    },
  });
}
