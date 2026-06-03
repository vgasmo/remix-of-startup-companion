import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface WorkspaceOwnership {
  id: string;
  assigned_consultor_id: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  consultor?: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
}

export function useWorkspaceOwner(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-owner', workspaceId],
    queryFn: async (): Promise<WorkspaceOwnership | null> => {
      if (!workspaceId) return null;

      // Use type assertion since the new columns may not be in the generated types yet
      const { data, error } = await (supabase as any)
        .from('workspaces')
        .select('id, assigned_consultor_id, last_contact_at, next_followup_at')
        .eq('id', workspaceId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Fetch consultor profile if assigned
      let consultor = null;
      if (data.assigned_consultor_id) {
        const { data: profile } = await supabase
          .from('profiles_safe')
          .select('id, full_name, email, avatar_url')
          .eq('id', data.assigned_consultor_id)
          .maybeSingle();
        consultor = profile;
      }

      return {
        id: data.id,
        assigned_consultor_id: data.assigned_consultor_id,
        last_contact_at: data.last_contact_at,
        next_followup_at: data.next_followup_at,
        consultor,
      };
    },
    enabled: !!workspaceId,
  });
}

export function useUpdateWorkspaceOwner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      workspaceId: string;
      assigned_consultor_id?: string | null;
      last_contact_at?: string | null;
      next_followup_at?: string | null;
    }) => {
      const { workspaceId, ...updates } = params;
      
      // Use type assertion since the new columns may not be in the generated types yet
      const { error } = await (supabase as any)
        .from('workspaces')
        .update(updates)
        .eq('id', workspaceId);

      if (error) throw error;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-owner', params.workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      notify.success(t('workspace.workspaceUpdated'));
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });
}

// Get all consultors for assignment dropdown
export function useConsultors() {
  return useQuery({
    queryKey: ['consultors'],
    queryFn: async () => {
      // Get users with consultor or admin role
      const { data: roleUsers, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'consultor']);

      if (roleError) throw roleError;
      if (!roleUsers?.length) return [];

      const userIds = [...new Set(roleUsers.map(r => r.user_id))];

      const { data: profiles, error: profileError } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds)
        .order('full_name');

      if (profileError) throw profileError;
      return profiles || [];
    },
  });
}

// Mark last contact (useful for quick action)
export function useMarkContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      // Use type assertion since the new columns may not be in the generated types yet
      const { error } = await (supabase as any)
        .from('workspaces')
        .update({ last_contact_at: new Date().toISOString() })
        .eq('id', workspaceId);

      if (error) throw error;
    },
    onSuccess: (_, workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-owner', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      notify.success(t('workspace.contactLogged'));
    },
  });
}
