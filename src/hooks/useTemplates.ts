import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/notify';
import i18n from '@/i18n';

export interface TemplateField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'checklist';
  placeholder?: string;
  options?: string[];
  required?: boolean;
  rows?: number;
}

export interface TemplateSection {
  title: string;
  description?: string;
  fields: TemplateField[];
}

export interface TemplateSchema {
  sections: TemplateSection[];
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  schema_json: TemplateSchema | null;
  is_global: boolean;
  program_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface TemplateInstance {
  id: string;
  workspace_id: string;
  template_id: string;
  data_json: Record<string, unknown> | null;
  status: string;
  review_status: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  template?: Template;
  reviewer?: { full_name: string | null; email: string } | null;
}

// Fetch all global templates
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []).map(t => ({
        ...t,
        schema_json: t.schema_json as unknown as TemplateSchema | null,
      })) as Template[];
    },
  });
}

// Admin: Create template
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: {
      name: string;
      description?: string;
      category?: string;
      schema_json?: TemplateSchema;
      is_global?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('templates')
        .insert({
          name: template.name,
          description: template.description || null,
          category: template.category || null,
          schema_json: template.schema_json as unknown as Json,
          is_global: template.is_global ?? true,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      notify.success(i18n.t('common.created'));
    },
  });
}

// Admin: Update template
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string;
      name?: string;
      description?: string | null;
      category?: string | null;
      schema_json?: TemplateSchema;
      is_global?: boolean;
    }) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (updates.schema_json) {
        updateData.schema_json = updates.schema_json as unknown as Json;
      }

      const { data, error } = await supabase
        .from('templates')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      notify.success(i18n.t('common.updated'));
    },
  });
}

// Admin: Delete template
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      notify.success(i18n.t('common.deleted'));
    },
  });
}

// Workspace: Get template instances
export function useTemplateInstances(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['template-instances', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('template_instances')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (error) throw error;
      
      // Get template details
      const templateIds = [...new Set(data?.map(ti => ti.template_id) || [])];
      let templates: Template[] = [];
      
      if (templateIds.length > 0) {
        const { data: templatesData } = await supabase
          .from('templates')
          .select('*')
          .in('id', templateIds);
        templates = (templatesData || []).map(t => ({
          ...t,
          schema_json: t.schema_json as unknown as TemplateSchema | null,
        })) as Template[];
      }

      return (data || []).map(ti => ({
        ...ti,
        data_json: ti.data_json as Record<string, unknown> | null,
        template: templates.find(t => t.id === ti.template_id),
      })) as TemplateInstance[];
    },
    enabled: !!workspaceId,
  });
}

// Workspace: Create or update template instance
export function useUpsertTemplateInstance(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      template_id,
      data_json,
      existingId,
    }: {
      template_id: string;
      data_json: Record<string, unknown>;
      existingId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Fast path: caller already has an instance id — straight UPDATE.
      if (existingId) {
        const { data, error } = await supabase
          .from('template_instances')
          .update({
            data_json: data_json as unknown as Json,
            status: 'in_progress',
          })
          .eq('id', existingId)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      // No id yet — true upsert against the unique (workspace_id, template_id) index.
      // Race-safe: if a parallel tab/insert wins, the conflict path returns the canonical row.
      const upsertRes = await supabase
        .from('template_instances')
        .upsert(
          {
            workspace_id: workspaceId,
            template_id,
            data_json: data_json as unknown as Json,
            status: 'in_progress',
            created_by: user?.id,
          },
          { onConflict: 'workspace_id,template_id', ignoreDuplicates: false },
        )
        .select()
        .single();

      if (!upsertRes.error) return upsertRes.data;

      // Last-resort recovery: some Supabase setups still surface 23505 if the
      // conflict target is partially indexed. Locate the existing row and patch it.
      if (upsertRes.error.code === '23505') {
        const { data: existing, error: selErr } = await supabase
          .from('template_instances')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('template_id', template_id)
          .maybeSingle();
        if (selErr) throw selErr;
        if (!existing) throw upsertRes.error;
        const { data, error } = await supabase
          .from('template_instances')
          .update({ data_json: data_json as unknown as Json, status: 'in_progress' })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      throw upsertRes.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-instances', workspaceId] });
    },
  });
}

// Mark template instance as complete
export function useCompleteTemplateInstance(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await supabase
        .from('template_instances')
        .update({ status: 'completed' })
        .eq('id', instanceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-instances', workspaceId] });
    },
  });
}

// Submit template for review (founder action)
export function useSubmitForReview(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await supabase
        .from('template_instances')
        .update({ 
          review_status: 'pending_review',
          reviewed_at: null,
          reviewer_id: null,
          review_notes: null,
        })
        .eq('id', instanceId)
        .select()
        .single();

      if (error) throw error;
      
      // Send notification to reviewers (fire and forget)
      supabase.functions.invoke('send-template-notification', {
        body: { type: 'submitted', instanceId }
      }).catch(err => logger.error('Failed to send template notification', {}, err));
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-instances', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['pending-template-reviews'] });
    },
  });
}

// Review template (consultant/mentor action)
export function useReviewTemplateInstance(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      instanceId,
      review_status,
      review_notes,
    }: {
      instanceId: string;
      review_status: 'approved' | 'needs_changes' | 'reviewed';
      review_notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('template_instances')
        .update({ 
          review_status,
          reviewer_id: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: review_notes || null,
          status: review_status === 'approved' ? 'completed' : 'in_progress',
        })
        .eq('id', instanceId)
        .select()
        .single();

      if (error) throw error;
      
      // Send notification to founder about review (fire and forget)
      supabase.functions.invoke('send-template-notification', {
        body: { type: 'reviewed', instanceId, review_status, review_notes }
      }).catch(err => logger.error('Failed to send template notification', {}, err));
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-instances', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['pending-template-reviews'] });
    },
  });
}

// Get pending reviews for consultants/mentors
export function usePendingTemplateReviews() {
  return useQuery({
    queryKey: ['pending-template-reviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_instances')
        .select(`
          *,
          template:templates(id, name, category),
          workspace:workspaces(id, startup:startups(name))
        `)
        .eq('review_status', 'pending_review')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}
