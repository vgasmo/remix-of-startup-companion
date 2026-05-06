/**
 * useFounderMaturity — Classifies a founder into a maturity bucket so the UI
 * can progressively disclose complexity. Pure derivation, no extra queries.
 *
 * Buckets:
 *  - new_founder: just arrived; no first session, no KPI, very little activity
 *  - onboarding:  has at least one signal (session OR KPI OR action) but setup incomplete
 *  - active:      regular usage (KPIs + recent session OR multiple actions)
 *  - advanced:    investor-readiness focused / late-stage / many active signals
 *
 * Default for ambiguous cases is `new_founder` (we err on the side of calm).
 */
import { useMemo } from 'react';
import type { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

export type FounderMaturity = 'new_founder' | 'onboarding' | 'active' | 'advanced';

export interface FounderMaturityState {
  maturity: FounderMaturity;
  isBeginner: boolean;     // new_founder | onboarding
  showAdvancedByDefault: boolean; // active | advanced
}

export function useFounderMaturity(workspace: WorkspaceWithDetails | undefined): FounderMaturityState {
  return useMemo<FounderMaturityState>(() => {
    if (!workspace) {
      return { maturity: 'new_founder', isBeginner: true, showAdvancedByDefault: false };
    }

    const hasKpis = Boolean(workspace.hasCurrentMonthKpi);
    const hasSession = Boolean(workspace.lastSession);
    const overdue = workspace.overdueActionsCount ?? 0;
    const stage = workspace.stage as string | undefined;
    const advancedStage = stage === 'growth' || stage === 'scale';

    // Advanced: clearly mature founder
    if (advancedStage && hasKpis && hasSession) {
      return { maturity: 'advanced', isBeginner: false, showAdvancedByDefault: true };
    }

    // Active: has KPIs and at least one session, or consistent recent activity
    if (hasKpis && hasSession) {
      return { maturity: 'active', isBeginner: false, showAdvancedByDefault: true };
    }

    // Onboarding: at least one signal of life
    if (hasKpis || hasSession || overdue > 0) {
      return { maturity: 'onboarding', isBeginner: true, showAdvancedByDefault: false };
    }

    // Default — calm new-founder mode
    return { maturity: 'new_founder', isBeginner: true, showAdvancedByDefault: false };
  }, [workspace]);
}
