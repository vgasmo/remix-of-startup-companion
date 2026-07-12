import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import i18n from '@/i18n';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

export interface DataroomItem {
  id: string;
  dataroom_id: string;
  type: 'document' | 'investor_update' | 'link';
  title: string;
  description: string | null;
  document_id: string | null;
  investor_update_id: string | null;
  url: string | null;
  sort_order: number;
  visibility: 'investors' | 'internal';
  created_by: string | null;
  created_at: string;
}

export interface DataroomShareLink {
  id: string;
  dataroom_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  allow_download: boolean;
  last_access_at: string | null;
  access_count: number;
}

export interface Dataroom {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export function useDataroom(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['dataroom', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      
      const { data, error } = await supabase
        .from('datarooms')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Dataroom | null;
    },
    enabled: !!workspaceId,
  });
}

export function useDataroomItems(dataroomId: string | undefined) {
  return useQuery({
    queryKey: ['dataroom-items', dataroomId],
    queryFn: async () => {
      if (!dataroomId) return [];
      
      const { data, error } = await supabase
        .from('dataroom_items')
        .select(`
          *,
          document:documents(id, name, file_path, mime_type),
          investor_update:investor_updates(id, month, content_json)
        `)
        .eq('dataroom_id', dataroomId)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!dataroomId,
  });
}

export function useDataroomShareLinks(dataroomId: string | undefined) {
  return useQuery({
    queryKey: ['dataroom-links', dataroomId],
    queryFn: async () => {
      if (!dataroomId) return [];
      
      const { data, error } = await supabase
        .from('dataroom_share_links')
        .select('*')
        .eq('dataroom_id', dataroomId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as DataroomShareLink[];
    },
    enabled: !!dataroomId,
  });
}

export function useEnsureDataroom() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data, error } = await supabase.rpc('ensure_dataroom_exists', {
        _workspace_id: workspaceId
      });
      
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_, workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ['dataroom', workspaceId] });
    },
  });
}

export function useCreateDataroomItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (item: {
      dataroom_id: string;
      type: 'document' | 'investor_update' | 'link';
      title: string;
      description?: string;
      document_id?: string;
      investor_update_id?: string;
      url?: string;
      visibility?: 'investors' | 'internal';
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get max sort_order
      const { data: existing } = await supabase
        .from('dataroom_items')
        .select('sort_order')
        .eq('dataroom_id', item.dataroom_id)
        .order('sort_order', { ascending: false })
        .limit(1);
      
      const maxOrder = existing?.[0]?.sort_order ?? -1;
      
      const { data, error } = await supabase
        .from('dataroom_items')
        .insert({
          ...item,
          sort_order: maxOrder + 1,
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dataroom-items', data.dataroom_id] });
      // Toast owned by DataroomTab.tsx (t('dataroom.itemAdded')) to match update/delete/link pattern.
    },
  });
}

export function useUpdateDataroomItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DataroomItem> & { id: string }) => {
      const { error } = await supabase
        .from('dataroom_items')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataroom-items'] });
    },
  });
}

export function useDeleteDataroomItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('dataroom_items')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataroom-items'] });
    },
  });
}

export function useCreateShareLink() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      workspace_id: string;
      expires_in_days?: number;
      allow_download?: boolean;
    }) => {
      const { data, error } = await invokeWithAuth('dataroom-create-link', {
        body: params,
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data.link as { id: string; url: string; token: string; expires_at: string | null; allow_download: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataroom-links'] });
    },
  });
}

export function useRevokeShareLink() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { data, error } = await invokeWithAuth('dataroom-revoke-link', {
        body: { link_id: linkId },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataroom-links'] });
    },
  });
}
