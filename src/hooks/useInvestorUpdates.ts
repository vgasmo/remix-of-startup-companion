import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface InvestorUpdate {
  id: string;
  workspace_id: string;
  month: string;
  content_json: {
    startup_name: string;
    highlights: string[];
    lowlights: string[];
    kpis: Array<{
      name: string;
      value: number | null;
      target: number | null;
      unit: string;
      delta: number | null;
    }>;
    milestones_achieved: string[];
    next_milestones: Array<{ title: string; target_date: string }>;
    risks: string[];
    asks: string[];
    next_month_priorities: string[];
    health_score: number | null;
    stage: string;
  };
  generated_by: string | null;
  sent_at: string | null;
  sent_to: any;
  created_at: string;
}

export function useInvestorUpdates(workspaceId: string) {
  return useQuery({
    queryKey: ['investor-updates', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investor_updates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('month', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as InvestorUpdate[];
    },
    enabled: !!workspaceId,
  });
}

export function useGenerateInvestorUpdate() {
  const queryClient = useQueryClient();

  const normalizeMonth = (input: string) => {
    // UI uses <input type="month" /> which returns YYYY-MM
    if (/^\d{4}-\d{2}$/.test(input)) return `${input}-01`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    throw new Error('Invalid month format');
  };

  return useMutation({
    mutationFn: async ({ workspaceId, month }: { workspaceId: string; month: string }) => {
      const { data, error } = await supabase.functions.invoke('generate-investor-update', {
        body: { workspace_id: workspaceId, month: normalizeMonth(month) },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.update as InvestorUpdate;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['investor-updates', workspaceId] });
    },
  });
}

export function useUpdateInvestorUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: Partial<InvestorUpdate['content_json']> }) => {
      const { data: existing, error: fetchError } = await supabase
        .from('investor_updates')
        .select('content_json, workspace_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const existingContent = existing.content_json as Record<string, unknown> || {};
      const mergedContent = { ...existingContent, ...content };

      const { error } = await supabase
        .from('investor_updates')
        .update({ content_json: mergedContent })
        .eq('id', id);

      if (error) throw error;
      return { id, workspace_id: existing.workspace_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['investor-updates', data.workspace_id] });
    },
  });
}

// Share links now use the dataroom system
// These are kept for backward compatibility but redirect to dataroom_share_links
export function useShareLinks(workspaceId: string) {
  return useQuery({
    queryKey: ['investor-share-links', workspaceId],
    queryFn: async () => {
      // First get the dataroom for this workspace
      const { data: dataroom } = await supabase
        .from('datarooms')
        .select('id')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (!dataroom) return [];

      // Get share links from the new dataroom system
      const { data, error } = await supabase
        .from('dataroom_share_links')
        .select('*')
        .eq('dataroom_id', dataroom.id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Map to the expected format
      return (data || []).map(link => ({
        id: link.id,
        workspace_id: workspaceId,
        token: link.id, // Use id as token since we store hash
        scope: 'report_only',
        expires_at: link.expires_at,
        revoked_at: link.revoked_at,
        views_count: link.access_count,
        created_at: link.created_at,
      }));
    },
    enabled: !!workspaceId,
  });
}

export function useCreateShareLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      workspaceId, 
      scope, 
      expiresInDays 
    }: { 
      workspaceId: string; 
      scope: string; 
      expiresInDays: number;
    }) => {
      // Use the new dataroom share link system
      const { data, error } = await supabase.functions.invoke('dataroom-create-link', {
        body: { 
          workspace_id: workspaceId, 
          expires_in_days: expiresInDays,
          allow_download: true 
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      return {
        id: data.link.id,
        token: data.link.token,
        workspace_id: workspaceId,
        scope,
        expires_at: data.link.expires_at,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['investor-share-links', data.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ['dataroom-links'] });
    },
  });
}

export function useRevokeShareLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, workspaceId }: { id: string; workspaceId: string }) => {
      // Use the new dataroom revoke system
      const { data, error } = await supabase.functions.invoke('dataroom-revoke-link', {
        body: { link_id: id },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return { workspaceId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['investor-share-links', data.workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['dataroom-links'] });
    },
  });
}
