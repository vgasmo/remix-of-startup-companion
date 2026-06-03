import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface IntakeRoute {
  id: string;
  scope: 'global' | 'program';
  program_id: string | null;
  mode: 'single' | 'round_robin' | 'per_program';
  consultant_ids: string[];
  round_robin_index: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useIntakeRouting() {
  return useQuery({
    queryKey: ['intake-routing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intake_routing')
        .select('*')
        .order('scope', { ascending: true });
      
      if (error) throw error;
      return data as IntakeRoute[];
    },
  });
}

export function useGlobalIntakeRoute() {
  return useQuery({
    queryKey: ['intake-routing', 'global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intake_routing')
        .select('*')
        .eq('scope', 'global')
        .eq('active', true)
        .maybeSingle();
      
      if (error) throw error;
      return data as IntakeRoute | null;
    },
  });
}

export function useUpsertIntakeRoute() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (route: Partial<IntakeRoute> & { id?: string }) => {
      if (route.id) {
        const { data, error } = await supabase
          .from('intake_routing')
          .update({
            mode: route.mode,
            consultant_ids: route.consultant_ids,
            active: route.active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', route.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('intake_routing')
          .insert({
            scope: route.scope || 'global',
            program_id: route.program_id,
            mode: route.mode || 'single',
            consultant_ids: route.consultant_ids || [],
            active: route.active ?? true,
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake-routing'] });
      notify.success(t('intake.intakeRoutingUpdated'));
    },
    onError: (error) => {
      notify.error(t('intake.failedToUpdateIntakeRouting', { message: error.message }));
    },
  });
}

export function useConsultants() {
  return useQuery({
    queryKey: ['consultants-for-routing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'consultor');
      
      if (error) throw error;
      
      if (!data?.length) return [];
      
      const userIds = data.map(r => r.user_id);
      
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email')
        .in('id', userIds);
      
      if (profilesError) throw profilesError;
      
      return profiles || [];
    },
  });
}
