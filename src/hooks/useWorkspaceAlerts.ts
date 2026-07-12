import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";

import i18n from '@/i18n';
import { invokeWithAuth } from "@/lib/invokeWithAuth";
const t = i18n.t.bind(i18n);

export interface WorkspaceAlert {
  id: string;
  workspace_id: string;
  rule_type: string;
  severity: 'info' | 'warning' | 'critical';
  reason: string;
  evidence_json: Record<string, unknown>;
  status: 'active' | 'resolved' | 'ignored';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface AlertRule {
  id: string;
  program_id: string;
  rule_type: string;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertWithWorkspace extends WorkspaceAlert {
  workspace?: {
    id: string;
    startup?: {
      name: string;
    };
    program?: {
      name: string;
    };
  };
}

// Get all active alerts for current user's workspaces
export function useAllActiveAlerts() {
  return useQuery({
    queryKey: ['all-workspace-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_alerts')
        .select(`
          *,
          workspace:workspaces(
            id,
            startup:startups(name),
            program:programs(name)
          )
        `)
        .eq('status', 'active')
        .order('severity', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AlertWithWorkspace[];
    },
  });
}

// Get alerts for a specific workspace
export function useWorkspaceAlerts(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace-alerts', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_alerts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('severity', { ascending: false });

      if (error) throw error;
      return data as WorkspaceAlert[];
    },
    enabled: !!workspaceId,
  });
}

// Get alert count by severity
export function useAlertCounts() {
  return useQuery({
    queryKey: ['alert-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_alerts')
        .select('severity')
        .eq('status', 'active');

      if (error) throw error;

      const counts = {
        critical: 0,
        warning: 0,
        info: 0,
        total: data?.length || 0,
      };

      for (const alert of data || []) {
        if (alert.severity in counts) {
          counts[alert.severity as keyof typeof counts]++;
        }
      }

      return counts;
    },
  });
}

// Resolve an alert
export function useResolveAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('workspace_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', alertId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['all-workspace-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-counts'] });
      notify.success(t('alerts.resolved'));
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });
}

// Ignore an alert
export function useIgnoreAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('workspace_alerts')
        .update({
          status: 'ignored',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', alertId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['all-workspace-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-counts'] });
      notify.success(t('alerts.ignored'));
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });
}

// Get alert rules for a program
export function useProgramAlertRules(programId: string) {
  return useQuery({
    queryKey: ['program-alert-rules', programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('program_alert_rules')
        .select('*')
        .eq('program_id', programId)
        .order('rule_type');

      if (error) throw error;
      return data as AlertRule[];
    },
    enabled: !!programId,
  });
}

// Update alert rule
export function useUpdateAlertRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      threshold, 
      severity, 
      is_enabled 
    }: { 
      id: string; 
      threshold?: number; 
      severity?: string; 
      is_enabled?: boolean;
    }) => {
      const updates: Record<string, unknown> = {};
      if (threshold !== undefined) updates.threshold = threshold;
      if (severity !== undefined) updates.severity = severity;
      if (is_enabled !== undefined) updates.is_enabled = is_enabled;

      const { error } = await supabase
        .from('program_alert_rules')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program-alert-rules'] });
      notify.success(t('alerts.ruleUpdated'));
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });
}

// Trigger manual recompute
export function useRecomputeAlerts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeWithAuth('recompute-workspace-alerts');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['all-workspace-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-counts'] });
      notify.success(t('alerts.recalculated'));
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });
}

// Get CTA for alert type
export function getAlertCTA(ruleType: string, workspaceId: string): { label: string; href: string } | null {
  switch (ruleType) {
    case 'no_session_days':
      return { label: t('alerts.cta.scheduleSession', 'Agendar sessão'), href: `/workspace/${workspaceId}?tab=agenda` };
    case 'overdue_actions_count':
      return { label: t('alerts.cta.viewActions', 'Ver ações'), href: `/workspace/${workspaceId}?tab=milestones-actions&sub=actions` };
    case 'missing_kpis_current_month':
      return { label: t('alerts.cta.updateKpis', 'Atualizar KPIs'), href: `/workspace/${workspaceId}?tab=kpis` };
    case 'checkin_overdue_days':
      return { label: t('alerts.cta.completeCheckin', 'Fazer check-in'), href: `/workspace/${workspaceId}?tab=overview` };
    case 'milestone_overdue_count':
      return { label: t('alerts.cta.viewMilestones', 'Ver marcos'), href: `/workspace/${workspaceId}?tab=milestones-actions` };
    default:
      return null;
  }
}

// Get severity config
export function getSeverityConfig(severity: string) {
  switch (severity) {
    case 'critical':
      return { color: 'bg-destructive/10 text-destructive border border-destructive/25', icon: '🔴', label: t('alerts.critical', 'Crítico') };
    case 'warning':
      return { color: 'bg-warning/10 text-warning border border-warning/25', icon: '🟠', label: t('alerts.warning', 'Aviso') };
    case 'info':
      return { color: 'bg-info/10 text-info border border-info/25', icon: '🔵', label: t('alerts.info', 'Info') };
    default:
      return { color: 'bg-muted text-muted-foreground border border-border', icon: '⚪', label: t('alerts.unknown', 'Desconhecido') };
  }
}

// Get rule type label
export function getRuleTypeLabel(ruleType: string): string {
  switch (ruleType) {
    case 'no_session_days':
      return t('alerts.ruleType.noSessionDays', 'Dias sem sessão');
    case 'overdue_actions_count':
      return t('alerts.ruleType.overdueActions', 'Ações atrasadas');
    case 'missing_kpis_current_month':
      return t('alerts.ruleType.missingKpis', 'KPIs em falta');
    case 'checkin_overdue_days':
      return t('alerts.ruleType.checkinOverdue', 'Check-in atrasado');
    case 'milestone_overdue_count':
      return t('alerts.ruleType.milestoneOverdue', 'Marcos atrasados');
    default:
      return ruleType;
  }
}

