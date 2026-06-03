/**
 * Backoffice hooks - Contracts domain
 * Split from useBackoffice.ts for maintainability
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import type { IncubationType } from './useIncubationTypes';
import type { Building } from './useBuildings';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface StartupContract {
  id: string;
  workspace_id: string | null;
  incubation_type_id: string | null;
  contract_number: string | null;
  organization_name: string | null;
  status: 'draft' | 'pending_signature' | 'active' | 'suspended' | 'terminated' | 'expired';
  start_date: string;
  end_date: string | null;
  signed_at: string | null;
  monthly_fee: number;
  currency: string;
  discount_percentage: number;
  discount_reason: string | null;
  discount_applied_by: string | null;
  equity_percentage: number | null;
  billing_day: number;
  payment_terms_days: number;
  notes: string | null;
  document_url: string | null;
  square_meters: number | null;
  building_id: string | null;
  funnel_item_id: string | null;
  created_at: string;
  // Signature provider fields
  signature_provider: 'docusign' | 'pandadoc' | 'manual' | null;
  signature_status: string | null;
  signature_requested_at: string | null;
  provider_document_id: string | null;
  provider_last_sync_at: string | null;
  provider_last_error: string | null;
  provider_last_event: string | null;
  provider_sent_at: string | null;
  provider_completed_at: string | null;
  docusign_envelope_id: string | null;
  // Bilateral signing fields
  founder_signer_status: string | null;
  counter_signer_name: string | null;
  counter_signer_email: string | null;
  counter_signer_status: string | null;
  workspace?: { id: string; startup?: { name: string } | null } | null;
  incubation_type?: IncubationType | null;
  building?: Building | null;
}

export function useContracts(filters?: { status?: string; workspaceId?: string }) {
  return useQuery({
    queryKey: ['contracts', filters],
    queryFn: async () => {
      let query = supabase
        .from('startup_contracts')
        .select(`
          *,
          workspace:workspaces(id, startup:startups(name)),
          incubation_type:incubation_types(*),
          building:buildings(*)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.workspaceId) query = query.eq('workspace_id', filters.workspaceId);

      const { data, error } = await query;
      if (error) throw error;
      return data as StartupContract[];
    },
  });
}

export function useCreateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      notify.success(t('backoffice.contratoCriado'));
    },
    onError: () => notify.error(t('backoffice.erroAoCriarContrato')),
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, unknown> & { id: string }) => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      notify.success(t('backoffice.contratoAtualizado'));
    },
    onError: () => notify.error(t('backoffice.erroAoAtualizarContrato')),
  });
}
