import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { startOfMonth, subMonths, format, isPast, isToday, parseISO } from 'date-fns';
import { notify } from "@/lib/notify";
import type { Database } from '@/integrations/supabase/types';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);

type HealthScore = Database['public']['Enums']['health_score'];

export interface HealthExplanationFactor {
  factor: string;
  score: number;
  maxScore: number;
  details: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface WorkspaceHealth {
  id: string;
  health_score: string | null;
  health_score_calculated: string | null;
  health_score_numeric: number | null;
  health_score_override: string | null;
  health_score_updated_at: string | null;
  health_score_explanation: HealthExplanationFactor[];
  health_score_components: {
    actions: number;
    sessions: number;
    kpis: number;
    checkins: number;
  } | null;
}

export interface HealthComputationResult {
  score: number;
  healthScore: HealthScore;
  healthStatus: 'green' | 'yellow' | 'red';
  reasons: string[];
}

// Get health score for a workspace (new API)
export function useWorkspaceHealth(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace-health', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, health_score, health_score_calculated, health_score_numeric, health_score_override, health_score_updated_at, health_score_explanation, health_score_components')
        .eq('id', workspaceId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        health_score_explanation: Array.isArray(data.health_score_explanation) 
          ? (data.health_score_explanation as unknown as HealthExplanationFactor[])
          : [],
        health_score_components: data.health_score_components as WorkspaceHealth['health_score_components'],
      } as WorkspaceHealth;
    },
    enabled: !!workspaceId,
  });
}

// Get health distribution
export function useHealthDistribution() {
  return useQuery({
    queryKey: ['health-distribution'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('health_score, health_score_override')
        .eq('status', 'active')
        .limit(1000);

      if (error) throw error;
      const distribution = { thriving: 0, healthy: 0, stable: 0, at_risk: 0, critical: 0, unknown: 0 };
      for (const ws of data || []) {
        const score = ws.health_score_override || ws.health_score;
        if (score && score in distribution) distribution[score as keyof typeof distribution]++;
        else distribution.unknown++;
      }
      return distribution;
    },
  });
}

// Set health score override
export function useSetHealthOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, override, reason }: { workspaceId: string; override: HealthScore | null; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('workspaces').update({ health_score_override: override, health_score: override }).eq('id', workspaceId);
      if (error) throw error;
      await supabase.from('activity_log').insert({ user_id: user.id, workspace_id: workspaceId, entity_type: 'workspace', entity_id: workspaceId, action: override ? 'health_score_override_set' : 'health_score_override_removed', metadata: { new_override: override, reason } });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-health', vars.workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['health-distribution'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      notify.success(vars.override ? 'Override aplicado' : 'Override removido');
    },
    onError: (error: Error) => notify.error(error.message),
  });
}

// Trigger manual recompute
export function useRecomputeHealthScores() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('recompute-health-scores');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-health'] });
      queryClient.invalidateQueries({ queryKey: ['health-distribution'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      notify.success(t('health.healthScoresRecalculados'));
    },
    onError: (error: Error) => notify.error(error.message),
  });
}

// Get health score config - returns translation keys for label/description
export function getHealthScoreConfig(score: string | null) {
  const configs: Record<string, { color: string; icon: string; labelKey: string; descriptionKey: string }> = {
    thriving: { color: 'bg-health-thriving/15 text-health-thriving border border-health-thriving/25', icon: '🌟', labelKey: 'health.levels.thriving', descriptionKey: 'health.descriptions.thriving' },
    healthy: { color: 'bg-health-healthy/15 text-health-healthy border border-health-healthy/25', icon: '✅', labelKey: 'health.levels.healthy', descriptionKey: 'health.descriptions.healthy' },
    stable: { color: 'bg-health-stable/15 text-health-stable border border-health-stable/25', icon: '➡️', labelKey: 'health.levels.stable', descriptionKey: 'health.descriptions.stable' },
    at_risk: { color: 'bg-health-at-risk/15 text-health-at-risk border border-health-at-risk/25', icon: '⚠️', labelKey: 'health.levels.at_risk', descriptionKey: 'health.descriptions.at_risk' },
    critical: { color: 'bg-health-critical/15 text-health-critical border border-health-critical/25', icon: '🚨', labelKey: 'health.levels.critical', descriptionKey: 'health.descriptions.critical' },
  };
  return configs[score || ''] || { color: 'bg-muted text-muted-foreground border border-border', icon: '❓', labelKey: 'health.levels.unknown', descriptionKey: 'health.descriptions.unknown' };
}

// Legacy functions below for backwards compatibility
export async function computeWorkspaceHealth(workspaceId: string): Promise<HealthComputationResult> {
  const reasons: string[] = [];
  let score = 100;
  let forceRed = false;
  const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const previousMonth = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
  const { data: workspaceKpis } = await supabase.from('workspace_kpis').select('kpi_definition_id').eq('workspace_id', workspaceId).eq('required', true).eq('active', true);
  if (workspaceKpis && workspaceKpis.length > 0) {
    const requiredKpiIds = workspaceKpis.map(wk => wk.kpi_definition_id);
    const { data: currentMonthValues } = await supabase.from('kpi_values').select('kpi_definition_id').eq('workspace_id', workspaceId).eq('period_month', currentMonth).in('kpi_definition_id', requiredKpiIds).not('value', 'is', null);
    const currentMonthFilledIds = new Set(currentMonthValues?.map(v => v.kpi_definition_id) || []);
    const missingCurrentMonth = requiredKpiIds.filter(id => !currentMonthFilledIds.has(id));
    if (missingCurrentMonth.length > 0) {
      score -= 30;
      reasons.push(`Missing ${missingCurrentMonth.length} required KPI(s) for current month`);
      const { data: previousMonthValues } = await supabase.from('kpi_values').select('kpi_definition_id').eq('workspace_id', workspaceId).eq('period_month', previousMonth).in('kpi_definition_id', requiredKpiIds).not('value', 'is', null);
      const previousMonthFilledIds = new Set(previousMonthValues?.map(v => v.kpi_definition_id) || []);
      const missingPreviousMonth = requiredKpiIds.filter(id => !previousMonthFilledIds.has(id));
      if (missingPreviousMonth.length > 0) { forceRed = true; reasons.push(`Missing required KPIs for 2+ consecutive months`); }
    }
  }
  const { data: actionItems } = await supabase.from('action_items').select('id, due_date, status').eq('workspace_id', workspaceId).in('status', ['pending', 'in_progress']);
  const overdueItems = actionItems?.filter(item => item.due_date && isPast(parseISO(item.due_date)) && !isToday(parseISO(item.due_date))) || [];
  const overdueCount = overdueItems.length;
  if (overdueCount >= 10) { forceRed = true; reasons.push(`${overdueCount} overdue action items (critical)`); }
  else if (overdueCount >= 5) { score -= 20; reasons.push(`${overdueCount} overdue action items`); }
  else if (overdueCount > 0) { score -= 5; reasons.push(`${overdueCount} overdue action item(s)`); }
  score = Math.max(0, Math.min(100, score));
  let healthStatus: 'green' | 'yellow' | 'red' = forceRed ? 'red' : score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red';
  let healthScore: HealthScore = score >= 90 ? 'thriving' : score >= 75 ? 'healthy' : score >= 50 ? 'stable' : score >= 25 ? 'at_risk' : 'critical';
  if (forceRed && healthScore !== 'critical' && healthScore !== 'at_risk') healthScore = 'at_risk';
  if (reasons.length === 0) reasons.push('All health checks passed');
  return { score, healthScore, healthStatus, reasons };
}

export function useRecomputeHealth(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await computeWorkspaceHealth(workspaceId);
      const { data, error } = await supabase.from('workspaces').update({ health_score: result.healthScore, health_status: result.healthStatus }).eq('id', workspaceId).select().single();
      if (error) throw error;
      return { workspace: data, computation: result };
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }); queryClient.invalidateQueries({ queryKey: ['workspaces'] }); },
  });
}

export function useUpdateHealthNotes(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (healthNotes: string | null) => {
      const { data, error } = await supabase.from('workspaces').update({ health_notes: healthNotes }).eq('id', workspaceId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }); },
  });
}
