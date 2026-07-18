import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { sendTeamsNotification, getAppUrl } from '@/hooks/useIntegrationTriggers';
import { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

// P1.2: Helper to log activity
async function logActivity(action: string, entityType: string, entityId: string, workspaceId: string, metadata?: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from('activity_log').insert({
      user_id: user.id,
      workspace_id: workspaceId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: (metadata || {}) as Json,
    });
  } catch (e) {
    logger.error('Failed to log activity', {}, e);
  }
}

// Types
export interface CheckinDefinition {
  id: string;
  workspace_id: string;
  name: string;
  questions: CheckinQuestion[];
  kpi_definition_ids: string[];
  day_of_week: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CheckinQuestion {
  id: string;
  question: string;
  type: 'text' | 'number' | 'scale';
  required?: boolean;
}

export interface CheckinInstance {
  id: string;
  definition_id: string;
  workspace_id: string;
  week_start: string;
  due_date: string;
  status: 'pending' | 'submitted' | 'skipped';
  compliance_status: 'on_track' | 'needs_update' | 'overdue';
  submitted_at: string | null;
  submitted_by: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
  definition?: CheckinDefinition;
  responses?: CheckinResponse[];
}

export interface CheckinResponse {
  id: string;
  instance_id: string;
  question_id: string;
  response_value: string | null;
  response_number: number | null;
  kpi_definition_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitCheckinPayload {
  question_id: string;
  response_value?: string;
  response_number?: number;
  kpi_definition_id?: string;
}

// Hook: Get pending check-in for a workspace
export function usePendingCheckin(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['pending-checkin', workspaceId],
    queryFn: async (): Promise<CheckinInstance | null> => {
      if (!workspaceId) return null;

      const { data, error } = await supabase
        .from('checkin_instances')
        .select(`
          *,
          definition:checkin_definitions(*)
        `)
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Parse questions from JSON
        const definition = data.definition as any;
        if (definition?.questions) {
          definition.questions = typeof definition.questions === 'string' 
            ? JSON.parse(definition.questions) 
            : definition.questions;
        }
        return data as unknown as CheckinInstance;
      }
      
      return null;
    },
    enabled: !!workspaceId,
  });
}

// Hook: Get all pending check-ins for consultor dashboard
export function useAllPendingCheckins() {
  return useQuery({
    queryKey: ['all-pending-checkins'],
    queryFn: async (): Promise<(CheckinInstance & { 
      startup_name: string;
      program_name: string;
    })[]> => {
      const { data, error } = await supabase
        .from('checkin_instances')
        .select(`
          *,
          definition:checkin_definitions(name),
          workspace:workspaces(
            startup:startups(name),
            program:programs(name)
          )
        `)
        .eq('status', 'pending')
        .order('compliance_status', { ascending: false }) // overdue first
        .order('due_date', { ascending: true });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        ...item,
        startup_name: item.workspace?.startup?.name || 'Unknown',
        program_name: item.workspace?.program?.name || 'Unknown',
      }));
    },
  });
}

// Hook: Get check-in history for a workspace
export function useCheckinHistory(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['checkin-history', workspaceId],
    queryFn: async (): Promise<CheckinInstance[]> => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from('checkin_instances')
        .select(`
          *,
          definition:checkin_definitions(name),
          responses:checkin_responses(*)
        `)
        .eq('workspace_id', workspaceId)
        .order('week_start', { ascending: false })
        .limit(12);

      if (error) throw error;
      return (data || []) as unknown as CheckinInstance[];
    },
    enabled: !!workspaceId,
  });
}

// Hook: Submit check-in
export function useSubmitCheckin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      instanceId, 
      responses,
      workspaceId, // Added for Teams notification
    }: { 
      instanceId: string; 
      responses: SubmitCheckinPayload[];
      workspaceId?: string;
    }) => {
      // Convert to plain JSON-compatible objects
      const jsonResponses = responses.map(r => ({
        question_id: r.question_id,
        response_value: r.response_value ?? null,
        response_number: r.response_number ?? null,
        kpi_definition_id: r.kpi_definition_id ?? null,
      }));

      const { data, error } = await supabase.rpc('submit_checkin', {
        p_instance_id: instanceId,
        p_responses: jsonResponses as any,
      });

      if (error) throw error;
      return { instanceId, workspaceId };
    },
    onSuccess: (result) => {
      notify.success(t('checkins.submitted'));
      queryClient.invalidateQueries({ queryKey: ['pending-checkin'] });
      queryClient.invalidateQueries({ queryKey: ['checkin-history'] });
      queryClient.invalidateQueries({ queryKey: ['all-pending-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-values'] });
      // Dashboard "Atualizar KPIs" nudge reads hasCurrentMonthKpi via ['workspaces'].
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });

      // P1.2: Log activity
      if (result.workspaceId) {
        logActivity('submitted', 'checkin', result.instanceId, result.workspaceId);
      }

       // P0.1: Trigger Teams notification for check-in submission
       if (result.workspaceId) {
         (async () => {
           let startupName: string | undefined;
           try {
             const { data: ws } = await supabase
               .from('workspaces')
               .select('startup:startups(name)')
               .eq('id', result.workspaceId)
               .maybeSingle();
             startupName = (ws as any)?.startup?.name || undefined;
           } catch {
             // ignore
           }

           sendTeamsNotification({
             workspaceId: result.workspaceId,
             eventType: 'checkin_submitted',
             payload: {
                title: 'Monthly Check-in Submitted',
                summary: 'A founder has submitted their monthly check-in',
                startup_name: startupName,
                link: `${getAppUrl()}/workspace/${result.workspaceId}?tab=kpis`,
                linkText: 'View Check-in',
             },
           }).catch((err) => logger.warn('checkin_notification_failed', { error: String(err) }));
         })().catch((err) => logger.warn('checkin_notification_wrapper_failed', { error: String(err) }));
       }
    },
    onError: (error: any) => {
      notify.error(t('checkins.submitError'), {
        description: error.message,
      });
    },
  });
}

// Hook: Create/Update check-in definition (for admins/consultors)
export function useManageCheckinDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (definition: Partial<CheckinDefinition> & { workspace_id: string }) => {
      // Convert questions to JSON-compatible format
      const questionsJson = (definition.questions || []) as unknown as Record<string, unknown>[];

      if (definition.id) {
        // Update
        const { data, error } = await supabase
          .from('checkin_definitions')
          .update({
            name: definition.name,
            questions: questionsJson as any,
            kpi_definition_ids: definition.kpi_definition_ids,
            day_of_week: definition.day_of_week,
            is_active: definition.is_active,
          } as any)
          .eq('id', definition.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert
        const { data, error } = await supabase
          .from('checkin_definitions')
          .insert([{
            workspace_id: definition.workspace_id,
            name: definition.name || 'Monthly Check-in',
            questions: (questionsJson.length > 0 ? questionsJson : []) as any,
            kpi_definition_ids: definition.kpi_definition_ids || [],
            day_of_week: definition.day_of_week || 5,
            is_active: definition.is_active ?? true,
          }] as any)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data: any) => {
      notify.success(t('checkins.definitionSaved'));
      // Reader key is ['checkin-definition', workspaceId] (singular). Invalidate both
      // for forward compatibility, but the singular key is what the UI subscribes to.
      const wsId = data?.workspace_id;
      if (wsId) {
        queryClient.invalidateQueries({ queryKey: ['checkin-definition', wsId] });
      }
      queryClient.invalidateQueries({ queryKey: ['checkin-definitions'] });
    },
    onError: (error: any) => {
      notify.error(t('checkins.definitionSaveError'), {
        description: error.message,
      });
    },
  });
}

// Hook: Get check-in definition for a workspace
export function useCheckinDefinition(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['checkin-definition', workspaceId],
    queryFn: async (): Promise<CheckinDefinition | null> => {
      if (!workspaceId) return null;

      const { data, error } = await supabase
        .from('checkin_definitions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Parse questions from JSON
        const questions = typeof data.questions === 'string'
          ? JSON.parse(data.questions)
          : data.questions;
        return { ...data, questions } as CheckinDefinition;
      }
      
      return null;
    },
    enabled: !!workspaceId,
  });
}

// Hook: Skip a check-in
export function useSkipCheckin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase
        .from('checkin_instances')
        .update({ status: 'skipped' })
        .eq('id', instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      notify.info(t('checkins.skipped'));
      queryClient.invalidateQueries({ queryKey: ['pending-checkin'] });
      queryClient.invalidateQueries({ queryKey: ['all-pending-checkins'] });
    },
  });
}
