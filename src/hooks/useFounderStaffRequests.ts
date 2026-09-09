/**
 * Founder → Staff requests (change IBAN, address, legal rep, other data).
 * Founders create; staff review and update status/notes.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from '@/lib/notify';

export type FounderRequestType =
  | 'iban_change'
  | 'address_change'
  | 'legal_rep_change'
  | 'company_data_change'
  | 'contact_change'
  | 'other';

export type FounderRequestStatus = 'open' | 'in_review' | 'resolved' | 'rejected';

export interface FounderStaffRequest {
  id: string;
  workspace_id: string;
  created_by: string;
  request_type: FounderRequestType;
  title: string;
  description: string;
  status: FounderRequestStatus;
  staff_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useFounderStaffRequests(workspaceId?: string) {
  return useQuery({
    queryKey: ['founder-staff-requests', workspaceId ?? 'all'],
    queryFn: async (): Promise<FounderStaffRequest[]> => {
      let q = supabase
        .from('founder_staff_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as FounderStaffRequest[];
    },
  });
}

export function useCreateFounderRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      workspace_id: string;
      request_type: FounderRequestType;
      title: string;
      description: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('founder_staff_requests')
        .insert({ ...input, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as FounderStaffRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['founder-staff-requests'] });
      notify.success('Pedido enviado à equipa');
    },
    onError: (e: any) => notify.error(e?.message || 'Erro ao enviar pedido'),
  });
}

export function useUpdateFounderRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status?: FounderRequestStatus;
      staff_notes?: string | null;
    }) => {
      const patch: Record<string, any> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.staff_notes !== undefined) patch.staff_notes = input.staff_notes;
      if (input.status === 'resolved' || input.status === 'rejected') {
        patch.resolved_by = user?.id ?? null;
        patch.resolved_at = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from('founder_staff_requests')
        .update(patch as never)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data as FounderStaffRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['founder-staff-requests'] });
      notify.success('Pedido atualizado');
    },
    onError: (e: any) => notify.error(e?.message || 'Erro ao atualizar'),
  });
}
