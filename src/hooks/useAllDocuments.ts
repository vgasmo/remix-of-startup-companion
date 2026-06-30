import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useWorkspaces, ALL_WORKSPACE_STATUSES } from '@/hooks/useWorkspaces';

export interface AggregatedDocument {
  id: string;
  workspace_id: string;
  workspace_name: string;
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

export function useAllDocuments() {
  const { data: workspaces = [] } = useWorkspaces({}, false, ALL_WORKSPACE_STATUSES);
  const workspaceIds = workspaces.map(w => w.id);
  const workspaceMap = Object.fromEntries(workspaces.map(w => [w.id, w.startup?.name || w.stage || 'Workspace']));

  return useQuery({
    queryKey: ['all-documents', workspaceIds],
    queryFn: async (): Promise<AggregatedDocument[]> => {
      if (workspaceIds.length === 0) return [];

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .in('workspace_id', workspaceIds)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Fetch uploader profiles
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
        workspace_name: workspaceMap[doc.workspace_id] || 'Workspace',
        uploader: doc.uploaded_by ? uploaders[doc.uploaded_by] || null : null,
      }));
    },
    enabled: workspaceIds.length > 0,
  });
}
