/**
 * Backoffice hooks - Incubation Types domain
 * Split from useBackoffice.ts for maintainability
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface IncubationType {
  id: string;
  name: string;
  description: string | null;
  base_monthly_fee: number;
  base_currency: string;
  duration_months: number | null;
  includes_office_space: boolean;
  includes_mentoring_hours: number;
  includes_meeting_room_hours: number;
  equity_percentage: number | null;
  is_active: boolean;
  sort_order: number;
  contract_type: string | null;
  price_per_sqm: number | null;
  requires_space: boolean;
  is_virtual: boolean;
  created_at: string;
}

export function useIncubationTypes() {
  return useQuery({
    queryKey: ['incubation-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incubation_types')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as IncubationType[];
    },
  });
}

export function useCreateIncubationType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('incubation_types')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incubation-types'] });
      notify.success(t('backoffice.incubationTypeCreated'));
    },
    onError: () => notify.error(t('backoffice.incubationTypeCreateError')),
  });
}

export function useUpdateIncubationType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, unknown> & { id: string }) => {
      const { data, error } = await supabase
        .from('incubation_types')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incubation-types'] });
      notify.success(t('backoffice.incubationTypeUpdated'));
    },
    onError: () => notify.error(t('backoffice.incubationTypeUpdateError')),
  });
}
