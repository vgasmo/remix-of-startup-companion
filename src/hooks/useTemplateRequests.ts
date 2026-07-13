import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  templateRequestCreatedKey,
  templateRequestResolvedKey,
} from '@/lib/notificationEventKey';

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

async function notifyStaffOfNewRequest(req: TemplateRequest) {
  try {
    const recipients = new Set<string>();
    let startupName = 'Uma startup';
    if (req.workspace_id) {
      const { data: ws } = await supabase
        .from('workspaces')
        .select('assigned_consultor_id, startup:startups(name)')
        .eq('id', req.workspace_id)
        .maybeSingle();
      if (ws?.assigned_consultor_id) recipients.add(ws.assigned_consultor_id as string);
      startupName = (ws as any)?.startup?.name || startupName;

      // Include other active consultors/admins on the workspace so nothing is missed.
      const { data: peers } = await supabase
        .from('workspace_users')
        .select('user_id, role')
        .eq('workspace_id', req.workspace_id)
        .eq('active', true)
        .in('role', ['consultor', 'admin', 'backoffice']);
      peers?.forEach((p) => p.user_id && recipients.add(p.user_id as string));
    }
    if (recipients.size === 0) return;

    const link = req.workspace_id
      ? `/workspace/${req.workspace_id}?tab=documents&sub=tools`
      : '/admin?tab=programs';
    const rows = [...recipients].map((uid) => ({
      user_id: uid,
      type: 'template_request',
      title: `Novo pedido de template — ${startupName}`,
      message: req.title,
      link,
      read: false,
      entity_type: 'template_request',
      entity_id: req.id,
      metadata: { workspace_id: req.workspace_id, context_type: req.context_type },
    }));
    await supabase.from('notifications').insert(rows);
  } catch {
    // best-effort
  }
}

async function notifyRequesterOfResolution(req: TemplateRequest) {
  try {
    if (!req.requested_by) return;
    const title =
      req.status === 'fulfilled' ? 'Pedido de template resolvido'
      : req.status === 'rejected' ? 'Pedido de template rejeitado'
      : 'Pedido de template em curso';
    await supabase.from('notifications').insert({
      user_id: req.requested_by,
      type: 'template_request',
      title,
      message: req.title,
      link: req.workspace_id ? `/workspace/${req.workspace_id}?tab=documents&sub=tools` : null,
      read: false,
      entity_type: 'template_request',
      entity_id: req.id,
      metadata: { status: req.status, admin_note: req.admin_note },
    });
  } catch {
    // best-effort
  }
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
      const created = data as TemplateRequest;
      void notifyStaffOfNewRequest(created);
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}

export function useUpdateTemplateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status?: TemplateRequestStatus; admin_note?: string | null; fulfilled_template_id?: string | null; reopen?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.admin_note !== undefined) patch.admin_note = input.admin_note;
      if (input.fulfilled_template_id !== undefined) patch.fulfilled_template_id = input.fulfilled_template_id;
      if (input.reopen) {
        patch.resolved_by = null;
        patch.resolved_at = null;
        patch.fulfilled_template_id = null;
      } else if (input.status === 'fulfilled' || input.status === 'rejected') {
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
      const updated = data as TemplateRequest;
      if (input.status === 'fulfilled' || input.status === 'rejected' || input.status === 'in_progress') {
        void notifyRequesterOfResolution(updated);
      }
      return updated;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}
