/**
 * Backoffice hooks - Invoices domain
 * Split from useBackoffice.ts for maintainability
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import type { StartupContract } from './useContracts';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface Invoice {
  id: string;
  contract_id: string;
  workspace_id: string;
  invoice_number: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  issue_date: string;
  due_date: string;
  paid_at: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  line_items: unknown;
  notes: string | null;
  created_at: string;
  workspace?: { id: string; startup?: { name: string } | null };
  contract?: StartupContract | null;
}

export interface Payment {
  id: string;
  invoice_id: string;
  workspace_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export function useInvoices(filters?: { status?: string; workspaceId?: string }) {
  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select(`
          *,
          workspace:workspaces(id, startup:startups(name)),
          contract:startup_contracts(*)
        `)
        .order('issue_date', { ascending: false });

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.workspaceId) query = query.eq('workspace_id', filters.workspaceId);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Invoice[];
    },
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('invoices')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      notify.success(t('backoffice.invoiceCreated'));
    },
    onError: () => notify.error(t('backoffice.invoiceCreateError')),
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, unknown> & { id: string }) => {
      const { data, error } = await supabase
        .from('invoices')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      notify.success(t('backoffice.invoiceUpdated'));
    },
    onError: () => notify.error(t('backoffice.invoiceUpdateError')),
  });
}

export function usePayments(filters?: { invoiceId?: string; workspaceId?: string }) {
  return useQuery({
    queryKey: ['payments', filters],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('*')
        .order('payment_date', { ascending: false });

      if (filters?.invoiceId) query = query.eq('invoice_id', filters.invoiceId);
      if (filters?.workspaceId) query = query.eq('workspace_id', filters.workspaceId);

      const { data, error } = await query;
      if (error) throw error;
      return data as Payment[];
    },
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('payments')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      notify.success(t('backoffice.paymentRecorded'));
    },
    onError: () => notify.error(t('backoffice.paymentRecordError')),
  });
}
