import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/notify';
import i18n from '@/i18n';

export interface StaffTask {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  assignee_id: string;
  created_by: string | null;
  workspace_id: string | null;
  related_startup_id: string | null;
  related_user_id: string | null;
  priority: string | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
  // Joined data
  assignee?: { full_name: string | null; email: string; avatar_url: string | null } | null;
  startup?: { name: string } | null;
  workspace?: { id: string; startup: { name: string } | null } | null;
}

export interface StaffTaskFormData {
  title: string;
  description?: string | null;
  task_type: string;
  assignee_id: string;
  workspace_id?: string | null;
  related_startup_id?: string | null;
  related_user_id?: string | null;
  priority?: string;
  due_date?: string | null;
}

export function useStaffTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['staff-tasks', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_tasks')
        .select(`
          *,
          startup:startups(name),
          workspace:workspaces(id, startup:startups(name))
        `)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch assignee profiles separately
      const assigneeIds = [...new Set(data.map(t => t.assignee_id))];
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .in('id', assigneeIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return data.map(task => ({
        ...task,
        assignee: profileMap.get(task.assignee_id) || null,
      })) as StaffTask[];
    },
    enabled: !!user,
  });
}

export function useMyStaffTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-staff-tasks', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('staff_tasks')
        .select(`
          *,
          startup:startups(name),
          workspace:workspaces(id, startup:startups(name))
        `)
        .eq('assignee_id', user.id)
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false });

      if (error) throw error;
      
      // Add assignee (current user's profile)
      const { data: profile } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .eq('id', user.id)
        .single();
      
      return data.map(task => ({
        ...task,
        assignee: profile || null,
      })) as StaffTask[];
    },
    enabled: !!user,
  });
}

// Get tasks for a specific workspace
export function useWorkspaceStaffTasks(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-staff-tasks', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('staff_tasks')
        .select(`
          *,
          startup:startups(name),
          workspace:workspaces(id, startup:startups(name))
        `)
        .eq('workspace_id', workspaceId)
        .order('status', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false });

      if (error) throw error;
      
      // Fetch assignee profiles
      const assigneeIds = [...new Set(data.map(t => t.assignee_id))];
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .in('id', assigneeIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return data.map(task => ({
        ...task,
        assignee: profileMap.get(task.assignee_id) || null,
      })) as StaffTask[];
    },
    enabled: !!workspaceId,
  });
}

export function useCreateStaffTask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: StaffTaskFormData) => {
      const { data: result, error } = await supabase
        .from('staff_tasks')
        .insert({
          ...data,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Send email notification to assignee (fire and forget)
      if (result && data.assignee_id !== user?.id) {
        supabase.functions.invoke('send-task-notification', {
          body: { type: 'assigned', taskId: result.id }
        }).catch(err => logger.error('Failed to send task notification', {}, err));
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-staff-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-staff-tasks'] });
    },
  });
}

export function useUpdateStaffTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; description?: string | null; status?: string; priority?: string; due_date?: string | null }) => {
      const { data, error } = await supabase
        .from('staff_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-staff-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-staff-tasks'] });
    },
  });
}

export function useCompleteStaffTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('staff_tasks')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-staff-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-staff-tasks'] });
    },
  });
}

export function useDeleteStaffTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('staff_tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-staff-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-staff-tasks'] });
    },
  });
}
