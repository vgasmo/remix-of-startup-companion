import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface Document {
  id: string;
  workspace_id: string;
  name: string;
  file_path: string | null;
  external_url: string | null;
  document_type: string;
  category: string | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  uploader?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export function useDocuments(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['documents', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch uploader profiles separately
      const uploaderIds = [...new Set(data?.map(d => d.uploaded_by).filter(Boolean) as string[])];
      let uploaders: Record<string, { id: string; full_name: string | null; avatar_url: string | null }> = {};
      
      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles_safe')
          .select('id, full_name, avatar_url')
          .in('id', uploaderIds);
        
        if (profiles) {
          uploaders = Object.fromEntries(profiles.map(p => [p.id, p]));
        }
      }
      
      return (data || []).map(doc => ({
        ...doc,
        uploader: doc.uploaded_by ? uploaders[doc.uploaded_by] || null : null
      })) as Document[];
    },
    enabled: !!workspaceId,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      workspaceId, 
      file, 
      category,
      description 
    }: { 
      workspaceId: string; 
      file: File; 
      category?: string;
      description?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload file to storage
      const filePath = `${workspaceId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('workspace-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create document record
      const { data, error } = await supabase
        .from('documents')
        .insert({
          workspace_id: workspaceId,
          name: file.name,
          file_path: filePath,
          document_type: 'file', // Must be 'file' or 'link' per DB constraint
          mime_type: file.type || 'application/octet-stream',
          category,
          description,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (error) {
        // Clean up uploaded file if record creation fails
        await supabase.storage.from('workspace-documents').remove([filePath]);
        throw error;
      }

      // Fire-and-forget: notify consultors/mentors in this workspace.
      supabase.functions
        .invoke('notify-document-uploaded', { body: { document_id: data.id } })
        .catch((err) => logger.warn('notify_document_uploaded_failed', { error: String(err) }));

      return data;

    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.workspaceId] });
      notify.success(t('documents.uploaded'));

      // Check if this was their first ever document upload
      try {
        const { count } = await supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', variables.workspaceId);

        if (count === 1) {
          notify.success(t('documents.firstUploadCelebration'));
        }
      } catch {
        // Silent - celebration check is non-critical
      }
    },
    onError: (error) => {
      notify.error(t('documents.uploadError', { error: error.message }));
    },
  });
}

export function useAddExternalLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      workspaceId, 
      name,
      url,
      category,
      description 
    }: { 
      workspaceId: string; 
      name: string;
      url: string;
      category?: string;
      description?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('documents')
        .insert({
          workspace_id: workspaceId,
          name,
          external_url: url,
          document_type: 'link',
          category,
          description,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Fire-and-forget: notify consultors/mentors in this workspace.
      supabase.functions
        .invoke('notify-document-uploaded', { body: { document_id: data.id } })
        .catch((err) => logger.warn('notify_document_uploaded_failed', { error: String(err) }));

      return data;

    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.workspaceId] });
      notify.success(t('documents.linkAdded'));
    },
    onError: (error) => {
      notify.error(t('documents.linkAddError', { error: error.message }));
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ document, workspaceId }: { document: Document; workspaceId: string }) => {
      // Delete file from storage if it exists
      if (document.file_path) {
        const { error: storageError } = await supabase.storage
          .from('workspace-documents')
          .remove([document.file_path]);
        
        if (storageError) {
          logger.warn('storage_delete_failed', { error: String(storageError) });
        }
      }

      // Delete document record
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id);

      if (error) throw error;
      return document.id;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.workspaceId] });
      notify.success(t('documents.deleted'));
    },
    onError: (error) => {
      notify.error(t('documents.deleteError', { error: error.message }));
    },
  });
}

export function useGetDocumentUrl() {
  return async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('workspace-documents')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) throw error;
    return data.signedUrl;
  };
}
