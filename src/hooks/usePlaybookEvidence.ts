import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface PlaybookEvidence {
  id: string;
  workspace_id: string;
  playbook_item_id: string;
  file_path: string | null;
  notes: string | null;
  submitted_by: string;
  review_status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export function usePlaybookEvidence(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['playbook-evidence', workspaceId],
    queryFn: async (): Promise<PlaybookEvidence[]> => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from('playbook_step_evidence')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PlaybookEvidence[];
    },
    enabled: !!workspaceId,
  });
}

export function useSubmitEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      playbookItemId,
      file,
      notes,
    }: {
      workspaceId: string;
      playbookItemId: string;
      file?: File;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let filePath: string | null = null;
      if (file) {
        const ext = file.name.split('.').pop();
        const path = `${user.id}/${workspaceId}/${playbookItemId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('playbook-evidence')
          .upload(path, file);
        if (uploadError) throw uploadError;
        filePath = path;
      }

      const { data, error } = await supabase
        .from('playbook_step_evidence')
        .insert({
          workspace_id: workspaceId,
          playbook_item_id: playbookItemId,
          file_path: filePath,
          notes: notes || null,
          submitted_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['playbook-evidence', variables.workspaceId] });
      notify.success(t('playbooks.evidenceSubmitted', 'Evidência submetida com sucesso'));
    },
    onError: () => {
      notify.error(t('playbooks.evidenceError', 'Erro ao submeter evidência'));
    },
  });
}

export function useReviewEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      evidenceId,
      status,
      reviewNotes,
      workspaceId,
    }: {
      evidenceId: string;
      status: 'approved' | 'rejected';
      reviewNotes?: string;
      workspaceId: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('playbook_step_evidence')
        .update({
          review_status: status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null,
        })
        .eq('id', evidenceId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['playbook-evidence', variables.workspaceId] });
      notify.success(
        variables.status === 'approved'
          ? t('playbooks.evidenceApproved', 'Evidência aprovada')
          : t('playbooks.evidenceRejected', 'Evidência rejeitada')
      );
    },
  });
}