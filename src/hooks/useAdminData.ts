import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

// Programs
export function usePrograms() {
  return useQuery({
    queryKey: ['programs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programs')
        .select('id, name, description, start_date, end_date, is_active, program_type, settings_json, status, created_at, updated_at')
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (program: { name: string; description?: string; start_date?: string; end_date?: string; program_type?: 'incubation' | 'acceleration' }) => {
      const { data, error } = await supabase.from('programs').insert(program).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      notify.success(t('admin.programCreated'));
    },
  });
}

export function useUpdateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; start_date?: string; end_date?: string; is_active?: boolean; program_type?: 'incubation' | 'acceleration' }) => {
      const { data, error } = await supabase.from('programs').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['programs-for-routing'] });
      queryClient.invalidateQueries({ queryKey: ['programs-list'] });
      queryClient.invalidateQueries({ queryKey: ['intake-routing'] });
      notify.success(t('admin.programUpdated'));
    },
  });
}

export function useDeleteProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('programs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['programs-for-routing'] });
      queryClient.invalidateQueries({ queryKey: ['programs-list'] });
      queryClient.invalidateQueries({ queryKey: ['intake-routing'] });
      notify.success(t('admin.programDeleted'));
    },
  });
}

// Stages
export function useStages(programId: string | undefined) {
  return useQuery({
    queryKey: ['admin-stages', programId],
    queryFn: async () => {
      if (!programId) return [];
      const { data, error } = await supabase
        .from('stages')
        .select('*')
        .eq('program_id', programId)
        .order('position', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!programId,
  });
}

export function useCreateStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (stage: { name: string; program_id: string; position: number; description?: string }) => {
      const { data, error } = await supabase.from('stages').insert(stage).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-stages', vars.program_id] });
      notify.success(t('admin.stageCreated'));
    },
  });
}

export function useUpdateStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, program_id, ...updates }: { id: string; program_id: string; name?: string; position?: number; description?: string }) => {
      const { data, error } = await supabase.from('stages').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-stages', vars.program_id] });
      notify.success(t('admin.stageUpdated'));
    },
  });
}

export function useDeleteStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, program_id }: { id: string; program_id: string }) => {
      const { error } = await supabase.from('stages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-stages', vars.program_id] });
      notify.success(t('admin.stageDeleted'));
    },
  });
}

// Profiles (Users) - paginated
export function useProfiles(page: number = 0, pageSize: number = 50) {
  return useQuery({
    queryKey: ['admin-profiles', page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, created_at, account_status', { count: 'exact' })
        .order('full_name', { ascending: true })
        .range(from, to);
      
      if (error) throw error;
      return { data: data || [], count: count || 0, page, pageSize };
    },
  });
}

// User Roles
export function useUserRoles() {
  return useQuery({
    queryKey: ['admin-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role');
      if (error) throw error;
      return data;
    },
  });
}

export function useAddUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: 'admin' | 'consultor' | 'mentor_externo' | 'founder' | 'team_member' }) => {
      const { data, error } = await supabase.from('user_roles').insert({ user_id, role }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      notify.success(t('admin.roleAdded'));
    },
  });
}

export function useRemoveUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      notify.success(t('admin.roleRemoved'));
    },
  });
}

// Workspace Users
export function useWorkspaceUsers() {
  return useQuery({
    queryKey: ['admin-workspace-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_users')
        .select('id, workspace_id, user_id, role, active, created_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useAddWorkspaceUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspace_id, user_id, role, active = true }: { workspace_id: string; user_id: string; role: 'admin' | 'consultor' | 'mentor_externo' | 'founder' | 'team_member'; active?: boolean }) => {
      const { data, error } = await supabase.from('workspace_users').insert({ workspace_id, user_id, role, active }).select().single();
      if (error) throw error;

      // Ensure user has the role in user_roles (idempotent)
      await supabase.from('user_roles').upsert({ user_id, role }, { onConflict: 'user_id,role' });

      // Ensure account is approved
      await supabase.from('profiles').update({ account_status: 'approved' }).eq('id', user_id).eq('account_status', 'pending');

      // C5: If adding a founder, activate the workspace if it's pending/claimed
      if (role === 'founder') {
        await supabase.from('workspaces')
          .update({ status: 'active' })
          .eq('id', workspace_id)
          .in('status', ['pending', 'claimed']);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspace-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      notify.success(t('admin.userAssigned'));
    },
  });
}

export function useUpdateWorkspaceUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role, active }: { id: string; role?: 'admin' | 'consultor' | 'mentor_externo' | 'founder' | 'team_member'; active?: boolean }) => {
      const { data, error } = await supabase.from('workspace_users').update({ role, active }).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspace-users'] });
      notify.success(t('admin.assignmentUpdated'));
    },
  });
}

export function useRemoveWorkspaceUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workspace_users').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspace-users'] });
      notify.success(t('admin.userRemoved'));
    },
  });
}

// All workspaces (for admin)
export function useAllWorkspaces() {
  return useQuery({
    queryKey: ['admin-all-workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select(`
          id,
          startup:startups(id, name),
          program:programs(id, name)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// KPI Definitions
export function useKpiDefinitions() {
  return useQuery({
    queryKey: ['admin-kpi-definitions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_definitions')
        .select('*')
        .order('category', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateKpiDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (kpi: { name: string; description?: string; unit?: string; category?: string; direction?: string; is_global?: boolean; program_id?: string }) => {
      const { data, error } = await supabase.from('kpi_definitions').insert(kpi).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-kpi-definitions'] });
      notify.success(t('admin.kpiCreated'));
    },
  });
}

export function useUpdateKpiDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; unit?: string; category?: string; direction?: string; is_global?: boolean }) => {
      const { data, error } = await supabase.from('kpi_definitions').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-kpi-definitions'] });
      notify.success(t('admin.kpiUpdated'));
    },
  });
}

export function useDeleteKpiDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kpi_definitions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-kpi-definitions'] });
      notify.success(t('admin.kpiDeleted'));
    },
  });
}

// Workspace KPIs (required KPIs per workspace)
export function useWorkspaceKpis() {
  return useQuery({
    queryKey: ['admin-workspace-kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_kpis')
        .select('*');
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertWorkspaceKpi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspace_id, kpi_definition_id, required, target_value, active }: { workspace_id: string; kpi_definition_id: string; required?: boolean; target_value?: number; active?: boolean }) => {
      const { data, error } = await supabase
        .from('workspace_kpis')
        .upsert({ workspace_id, kpi_definition_id, required, target_value, active }, { onConflict: 'workspace_id,kpi_definition_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workspace-kpis'] });
      notify.success(t('admin.workspaceKpiUpdated'));
    },
  });
}
