import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import type { Json } from '@/integrations/supabase/types';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

export interface WorkflowRule {
  id: string;
  program_id: string | null;
  enabled: boolean;
  trigger_type: string;
  conditions_json: Json;
  actions_json: Json;
  name: string | null;
  description: string | null;
  created_at: string;
}

export interface WorkflowExecution {
  id: string;
  rule_id: string;
  workspace_id: string;
  trigger_event_id: string;
  status: string;
  result_json: Record<string, unknown>;
  created_at: string;
  rule?: WorkflowRule;
}

export function useWorkflowRules(programId?: string) {
  return useQuery({
    queryKey: ['workflow-rules', programId],
    queryFn: async () => {
      let query = supabase
        .from('workflow_rules')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (programId) {
        query = query.or(`program_id.eq.${programId},program_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as WorkflowRule[];
    },
  });
}

export function useUpdateWorkflowRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WorkflowRule> }) => {
      const { error } = await supabase
        .from('workflow_rules')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-rules'] });
      notify.success(t('workflow.ruleUpdated'));
    },
  });
}

export function useWorkflowExecutions(workspaceId?: string, limit = 10) {
  return useQuery({
    queryKey: ['workflow-executions', workspaceId, limit],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('workflow_executions')
        .select(`
          *,
          rule:workflow_rules(id, name, trigger_type)
        `)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as WorkflowExecution[];
    },
    enabled: !!workspaceId,
  });
}
