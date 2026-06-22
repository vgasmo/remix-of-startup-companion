import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface FundingRound {
  id: string;
  startup_id: string;
  round_type: string;
  target_amount: number | null;
  raised_amount: number | null;
  valuation: number | null;
  status: string;
  announced_at: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Investor {
  id: string;
  startup_id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export interface CapTableEntry {
  id: string;
  startup_id: string;
  holder_name: string;
  holder_type: string;
  shares: number;
  share_type: string;
  investment_amount: number | null;
  funding_round_id: string | null;
  vesting_start: string | null;
  vesting_months: number | null;
  cliff_months: number | null;
  notes: string | null;
  created_at: string;
}

export function useFundingRounds(startupId: string | undefined) {
  return useQuery({
    queryKey: ['funding-rounds', startupId],
    queryFn: async (): Promise<FundingRound[]> => {
      if (!startupId) return [];
      const { data, error } = await supabase
        .from('funding_rounds')
        .select('*')
        .eq('startup_id', startupId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!startupId,
  });
}

export function useCreateFundingRound() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (round: Omit<FundingRound, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('funding_rounds')
        .insert([round])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['funding-rounds', variables.startup_id] });
    },
  });
}

export function useUpdateFundingRound() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FundingRound> & { id: string }) => {
      const { error } = await supabase
        .from('funding_rounds')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funding-rounds'] });
    },
  });
}

export function useInvestors(startupId: string | undefined) {
  return useQuery({
    queryKey: ['investors', startupId],
    queryFn: async (): Promise<Investor[]> => {
      if (!startupId) return [];
      const { data, error } = await supabase
        .from('investors')
        .select('*')
        .eq('startup_id', startupId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!startupId,
  });
}

export function useCreateInvestor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (investor: Omit<Investor, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('investors')
        .insert([investor])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['investors', variables.startup_id] });
    },
  });
}

export function useUpdateInvestor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Investor> & { id: string }) => {
      const { error } = await supabase
        .from('investors')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investors'] });
    },
  });
}

export function useDeleteInvestor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('investors')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investors'] });
    },
  });
}

export function useCapTable(startupId: string | undefined) {
  return useQuery({
    queryKey: ['cap-table', startupId],
    queryFn: async (): Promise<CapTableEntry[]> => {
      if (!startupId) return [];
      const { data, error } = await supabase
        .from('cap_table_entries')
        .select('*')
        .eq('startup_id', startupId)
        .order('shares', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!startupId,
  });
}

export function useCreateCapTableEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Omit<CapTableEntry, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('cap_table_entries')
        .insert([entry])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cap-table', variables.startup_id] });
    },
  });
}

export function useUpdateCapTableEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CapTableEntry> & { id: string }) => {
      const { error } = await supabase
        .from('cap_table_entries')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cap-table'] });
    },
  });
}

export function useDeleteCapTableEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cap_table_entries')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cap-table'] });
    },
  });
}
