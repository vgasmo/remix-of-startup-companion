/**
 * Founder → Admin structured field change requests for startup profile data.
 * Uses the `startup_change_requests` table + approve/reject SECURITY DEFINER RPCs.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export type StartupChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type StartupChangeRequestFieldKey =
  | 'name'
  | 'website'
  | 'phone'
  | 'address'
  | 'nif'
  | 'main_contact_name'
  | 'main_contact_email'
  | 'main_contact_phone'
  | 'iban'
  | 'bank_name'
  | 'swift_bic'
  | 'legal_representative'
  | 'shareholders'
  | 'cap_table'
  | 'other';

export interface StartupChangeRequest {
  id: string;
  workspace_id: string | null;
  startup_id: string | null;
  requested_by: string;
  field_key: StartupChangeRequestFieldKey;
  field_label: string;
  current_value_json: unknown;
  requested_value_json: unknown;
  justification: string | null;
  status: StartupChangeRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  applied_at: string | null;
  applied_automatically: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewChangeRequestInput {
  field_key: StartupChangeRequestFieldKey;
  field_label: string;
  current_value: unknown;
  requested_value: unknown;
  justification?: string | null;
}

/** List requests for a workspace (founder + staff both use this). */
export function useStartupChangeRequests(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['startup-change-requests', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_change_requests')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StartupChangeRequest[];
    },
  });
}

/** All pending requests — admin inbox. */
export function useAllPendingStartupChangeRequests() {
  return useQuery({
    queryKey: ['startup-change-requests', 'inbox', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_change_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StartupChangeRequest[];
    },
  });
}

export function useSubmitStartupChangeRequests() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: {
      workspaceId: string;
      startupId: string | null;
      items: NewChangeRequestInput[];
      justification?: string | null;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const rows = args.items.map((it) => ({
        workspace_id: args.workspaceId,
        startup_id: args.startupId,
        requested_by: user.id,
        field_key: it.field_key,
        field_label: it.field_label,
        current_value_json: (it.current_value ?? null) as any,
        requested_value_json: (it.requested_value ?? null) as any,
        justification: it.justification ?? args.justification ?? null,
        status: 'pending' as const,
      }));
      const { data, error } = await supabase
        .from('startup_change_requests')
        .insert(rows)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['startup-change-requests', vars.workspaceId] });
      qc.invalidateQueries({ queryKey: ['startup-change-requests', 'inbox', 'pending'] });
    },
  });
}

export function useCancelStartupChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('startup_change_requests')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['startup-change-requests'] });
    },
  });
}

export function useApproveStartupChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; notes?: string | null }) => {
      const { data, error } = await supabase.rpc('approve_startup_change_request', {
        _request_id: args.id,
        _notes: args.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['startup-change-requests'] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useRejectStartupChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; notes?: string | null }) => {
      const { data, error } = await supabase.rpc('reject_startup_change_request', {
        _request_id: args.id,
        _notes: args.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['startup-change-requests'] });
    },
  });
}
