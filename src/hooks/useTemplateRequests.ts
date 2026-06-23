import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export type TemplateRequestStatus = 'pending' | 'in_progress' | 'fulfilled' | 'rejected';

export interface TemplateRequest {
  id: string;
  workspace_id: string | null;
  requested_by: string;
  context_type: 'action_item' | 'dataroom_item' | 'general' | string;
  context_ref: string | null;
  context_label: string | null;
  title: string;
  description: string | null;
  attachment_url: string | null;
  status: TemplateRequestStatus;
  admin_note: string | null;
  fulfilled_template_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateRequestInput {
  workspace_id?: string | null;
  context_type?: TemplateRequest['context_type'];
  context_ref?: string | null;
  context_label?: string | null;
  title: string;
  description?: string | null;
  attachment_url?: string | null;
}

const QK = 'template_requests';

export function useTemplateRequests(filters?: { workspaceId?: string; status?: TemplateRequestStatus }) {
  return useQuery({
    queryKey: [QK, filters ?? {}],
    queryFn: async (): Promise<TemplateRequest[]> => {
      let q = supabase.from('template_requests').select('*').order('created_at', { ascending: false });
      if (filters?.workspaceId) q = q.eq('workspace_id', filters.workspaceId);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as TemplateRequest[];
    },
  });
}

export function useMyTemplateRequests() {
  return useQuery({
    queryKey: [QK, 'mine'],
    queryFn: async (): Promise<TemplateRequest[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('template_requests')
        .select('*')
        .eq('requested_by', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as TemplateRequest[];
    },
  });
}

export function useCreateTemplateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTemplateRequestInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('template_requests')
        .insert({
          workspace_id: input.workspace_id ?? null,
          requested_by: user.id,
          context_type: input.context_type ?? 'general',
          context_ref: input.context_ref ?? null,
          context_label: input.context_label ?? null,
          title: input.title,
          description: input.description ?? null,
          attachment_url: input.attachment_url ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TemplateRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}

export function useUpdateTemplateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status?: TemplateRequestStatus; admin_note?: string | null; fulfilled_template_id?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.admin_note !== undefined) patch.admin_note = input.admin_note;
      if (input.fulfilled_template_id !== undefined) patch.fulfilled_template_id = input.fulfilled_template_id;
      if (input.status === 'fulfilled' || input.status === 'rejected') {
        patch.resolved_by = user?.id ?? null;
        patch.resolved_at = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from('template_requests')
        .update(patch)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data as TemplateRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}
