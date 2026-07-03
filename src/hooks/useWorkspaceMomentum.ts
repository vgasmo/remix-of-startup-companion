/**
 * useWorkspaceMomentum — portfolio-level momentum / stall prediction.
 *
 * Pure, deterministic, client-side. Computed from data already fetched by
 * useWorkspaces (no new queries, no new tables). Every score is traceable
 * to its signals — no opaque ML.
 *
 * v2 (future, NOT built): a `workspace_momentum` read-model refreshed by a
 * scheduled edge function for cross-session consistency and trend history.
 */

import { useMemo } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import type { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

export type MomentumBand = 'strong' | 'steady' | 'slowing' | 'at_risk';

export interface MomentumSignal {
  key: 'kpi' | 'session' | 'actions' | 'engagement' | 'health';
  label: string;
  status: 'good' | 'warn' | 'bad';
  detail: string;
}

export interface RecommendedAction {
  label: string;
  href: string;
}

export interface MomentumResult {
  workspaceId: string;
  momentumScore: number;          // 0–100
  band: MomentumBand;
  signals: MomentumSignal[];      // ordered worst-first
  recommendedAction: RecommendedAction;
}

/**
 * Single source of truth for thresholds + weights. Tunable.
 * All weights should sum to 1.0.
 */
export const MOMENTUM_CONFIG = {
  weights: {
    kpi: 0.22,
    session: 0.26,
    actions: 0.22,
    engagement: 0.15,
    health: 0.15,
  },
  bands: {
    strong: 75,    // score >= 75
    steady: 55,    // score >= 55
    slowing: 35,   // score >= 35
    // below 35 => at_risk
  },
  thresholds: {
    sessionDaysGood: 14,
    sessionDaysWarn: 30,
    sessionDaysBad: 45,
    engagementDaysGood: 7,
    engagementDaysWarn: 21,
    engagementDaysBad: 45,
    overdueRatioWarn: 0.25,
    overdueRatioBad: 0.5,
  },
} as const;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  try { return differenceInDays(new Date(), parseISO(iso)); } catch { return null; }
}

function scoreSession(daysSinceSession: number | null): { score: number; signal: MomentumSignal } {
  const t = MOMENTUM_CONFIG.thresholds;
  if (daysSinceSession === null) {
    return {
      score: 25,
      signal: { key: 'session', label: 'Sem sessões registadas', status: 'bad', detail: 'Ainda nenhuma sessão.' },
    };
  }
  let score = 100;
  let status: MomentumSignal['status'] = 'good';
  if (daysSinceSession >= t.sessionDaysBad) { score = 10; status = 'bad'; }
  else if (daysSinceSession >= t.sessionDaysWarn) { score = 40; status = 'warn'; }
  else if (daysSinceSession >= t.sessionDaysGood) { score = 70; status = 'warn'; }
  return {
    score,
    signal: {
      key: 'session',
      label: 'Última sessão',
      status,
      detail: `${daysSinceSession}d desde a última sessão`,
    },
  };
}

function scoreKpi(hasCurrent: boolean, lastKpiMonth: string | null): { score: number; signal: MomentumSignal } {
  if (hasCurrent) {
    return {
      score: 100,
      signal: { key: 'kpi', label: 'KPIs', status: 'good', detail: 'KPI do mês submetido' },
    };
  }
  if (!lastKpiMonth) {
    return {
      score: 20,
      signal: { key: 'kpi', label: 'KPIs', status: 'bad', detail: 'Nunca submeteu KPIs' },
    };
  }
  // Compute months since lastKpiMonth (format YYYY-MM-01-ish or YYYY-MM).
  const last = parseISO(lastKpiMonth.length === 7 ? `${lastKpiMonth}-01` : lastKpiMonth);
  const monthsBehind = Math.max(0, differenceInDays(new Date(), last) / 30);
  if (monthsBehind >= 3) {
    return { score: 15, signal: { key: 'kpi', label: 'KPIs', status: 'bad', detail: `${Math.round(monthsBehind)} meses sem KPIs` } };
  }
  if (monthsBehind >= 2) {
    return { score: 40, signal: { key: 'kpi', label: 'KPIs', status: 'warn', detail: '2 meses sem KPIs' } };
  }
  return { score: 65, signal: { key: 'kpi', label: 'KPIs', status: 'warn', detail: 'KPI do mês em falta' } };
}

function scoreActions(pending: number, overdue: number): { score: number; signal: MomentumSignal } {
  const total = pending + overdue;
  if (total === 0) {
    return { score: 90, signal: { key: 'actions', label: 'Ações', status: 'good', detail: 'Sem ações pendentes' } };
  }
  const ratio = overdue / total;
  const t = MOMENTUM_CONFIG.thresholds;
  if (ratio >= t.overdueRatioBad) {
    return { score: 15, signal: { key: 'actions', label: 'Ações', status: 'bad', detail: `${overdue}/${total} em atraso` } };
  }
  if (ratio >= t.overdueRatioWarn) {
    return { score: 45, signal: { key: 'actions', label: 'Ações', status: 'warn', detail: `${overdue}/${total} em atraso` } };
  }
  return { score: 80, signal: { key: 'actions', label: 'Ações', status: 'good', detail: `${total} ações ativas` } };
}

function scoreEngagement(daysSinceUpdate: number | null): { score: number; signal: MomentumSignal } {
  const t = MOMENTUM_CONFIG.thresholds;
  if (daysSinceUpdate === null) {
    return { score: 50, signal: { key: 'engagement', label: 'Atividade', status: 'warn', detail: 'Sem dados' } };
  }
  if (daysSinceUpdate >= t.engagementDaysBad) {
    return { score: 10, signal: { key: 'engagement', label: 'Atividade', status: 'bad', detail: `${daysSinceUpdate}d sem atividade` } };
  }
  if (daysSinceUpdate >= t.engagementDaysWarn) {
    return { score: 45, signal: { key: 'engagement', label: 'Atividade', status: 'warn', detail: `${daysSinceUpdate}d sem atividade` } };
  }
  if (daysSinceUpdate >= t.engagementDaysGood) {
    return { score: 75, signal: { key: 'engagement', label: 'Atividade', status: 'good', detail: `${daysSinceUpdate}d` } };
  }
  return { score: 100, signal: { key: 'engagement', label: 'Atividade', status: 'good', detail: 'Ativa esta semana' } };
}

const HEALTH_SCORE_MAP: Record<string, number> = {
  thriving: 100, healthy: 85, stable: 65, at_risk: 35, critical: 10,
};

function scoreHealth(health: string | null): { score: number; signal: MomentumSignal } {
  if (!health) {
    return { score: 60, signal: { key: 'health', label: 'Saúde', status: 'warn', detail: 'Sem avaliação' } };
  }
  const score = HEALTH_SCORE_MAP[health] ?? 60;
  const status: MomentumSignal['status'] = score >= 70 ? 'good' : score >= 40 ? 'warn' : 'bad';
  return { score, signal: { key: 'health', label: 'Saúde', status, detail: health } };
}

function bandFor(score: number): MomentumBand {
  const b = MOMENTUM_CONFIG.bands;
  if (score >= b.strong) return 'strong';
  if (score >= b.steady) return 'steady';
  if (score >= b.slowing) return 'slowing';
  return 'at_risk';
}

function recommendFor(workspace: WorkspaceWithDetails, signals: MomentumSignal[]): RecommendedAction {
  const worst = signals.find(s => s.status === 'bad') ?? signals[0];
  const base = `/workspace/${workspace.id}`;
  switch (worst?.key) {
    case 'actions':
      return { label: 'Ver ações em atraso', href: `${base}?tab=milestones-actions` };
    case 'session':
      return { label: 'Agendar check-in', href: `${base}?tab=sessions` };
    case 'kpi':
      return { label: 'Pedir KPIs do mês', href: `${base}?tab=kpis` };
    case 'engagement':
      return { label: 'Enviar mensagem', href: `${base}?tab=interactions` };
    case 'health':
      return { label: 'Rever estado de saúde', href: `${base}?tab=overview` };
    default:
      return { label: 'Abrir workspace', href: base };
  }
}

export function computeMomentum(workspace: WorkspaceWithDetails): MomentumResult {
  const w = MOMENTUM_CONFIG.weights;

  const session = scoreSession(daysSince(workspace.lastSession?.scheduled_at ?? null));
  const kpi = scoreKpi(workspace.hasCurrentMonthKpi, workspace.lastKpiMonth);
  const actions = scoreActions(workspace.pendingActionsCount, workspace.overdueActionsCount);
  const engagement = scoreEngagement(daysSince(workspace.updated_at));
  const health = scoreHealth((workspace.health_score_override ?? workspace.health_score) as string | null);

  const score = clamp(
    session.score * w.session +
    kpi.score * w.kpi +
    actions.score * w.actions +
    engagement.score * w.engagement +
    health.score * w.health,
  );

  const signals = [session.signal, kpi.signal, actions.signal, engagement.signal, health.signal]
    .sort((a, b) => statusRank(a.status) - statusRank(b.status));

  return {
    workspaceId: workspace.id,
    momentumScore: Math.round(score),
    band: bandFor(score),
    signals,
    recommendedAction: recommendFor(workspace, signals),
  };
}

function statusRank(s: MomentumSignal['status']): number {
  return s === 'bad' ? 0 : s === 'warn' ? 1 : 2;
}

/**
 * Compute momentum for a list of workspaces. Returns a stable, memoised array
 * (sorted lowest-score first).
 */
export function useWorkspaceMomentum(workspaces: WorkspaceWithDetails[] | undefined): MomentumResult[] {
  return useMemo(() => {
    if (!workspaces || workspaces.length === 0) return [];
    return workspaces.map(computeMomentum).sort((a, b) => a.momentumScore - b.momentumScore);
  }, [workspaces]);
}

/**
 * Single-workspace convenience.
 */
export function useWorkspaceMomentumSingle(workspace: WorkspaceWithDetails | null | undefined): MomentumResult | null {
  return useMemo(() => (workspace ? computeMomentum(workspace) : null), [workspace]);
}
