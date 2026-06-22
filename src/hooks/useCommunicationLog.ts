import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import type { Json } from '@/integrations/supabase/types';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface CommunicationEntry {
  id: string;
  workspace_id: string;
  channel: string;
  from_address: string | null;
  subject: string | null;
  body: string | null;
  metadata_json: Json;
  created_at: string;
}

export interface EmailAlias {
  id: string;
  workspace_id: string;
  alias: string;
  created_at: string;
}

export function useCommunicationLog(workspaceId?: string) {
  return useQuery({
    queryKey: ['communication-log', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('communication_log')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as CommunicationEntry[];
    },
    enabled: !!workspaceId,
  });
}

export function useEmailAlias(workspaceId?: string) {
  return useQuery({
    queryKey: ['email-alias', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      
      const { data, error } = await supabase
        .from('workspace_email_aliases')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      
      if (error) throw error;
      return data as EmailAlias | null;
    },
    enabled: !!workspaceId,
  });
}

export function useCreateEmailAlias() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      // Generate a unique alias
      const alias = `ws-${workspaceId.substring(0, 8)}-${Date.now().toString(36)}`;
      
      const { data, error } = await supabase
        .from('workspace_email_aliases')
        .insert({ workspace_id: workspaceId, alias })
        .select()
        .single();
      
      if (error) throw error;
      return data as EmailAlias;
    },
    onSuccess: (_, workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ['email-alias', workspaceId] });
      notify.success(t('communication.emailAliasCreated'));
    },
  });
}

export function useAddCommunication() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (entry: {
      workspace_id: string;
      channel?: string;
      from_address?: string;
      subject?: string;
      body?: string;
      metadata_json?: Json;
    }) => {
      const { data, error } = await supabase
        .from('communication_log')
        .insert(entry)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['communication-log', variables.workspace_id] });
      notify.success(t('communication.communicationLogged'));
    },
  });
}
