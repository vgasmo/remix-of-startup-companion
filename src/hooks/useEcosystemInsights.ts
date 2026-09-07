import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive';

export interface EcosystemInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

interface HealthDistribution {
  critical: number;
  at_risk: number;
  stable: number;
  healthy: number;
  thriving: number;
}

interface InsightInput {
  totalStartups: number;
  activeStartups: number;
  healthDistribution: HealthDistribution;
  overdueActionsCount: number;
  missingKpisCount: number;
  sessionsThisWeek: number;
  pendingApprovals: number;
  totalMentors: number;
  activeMentors: number;
  totalConsultants: number;
}

/**
 * Computes actionable "so what?" insights from ecosystem stats.
 * Returns at most 3 highest-priority insights.
 */
export function useEcosystemInsights(stats: InsightInput | undefined): EcosystemInsight[] {
  const { t } = useTranslation();

  return useMemo(() => {
    if (!stats) return [];
    const insights: EcosystemInsight[] = [];

    const { healthDistribution: hd, totalStartups } = stats;
    const atRiskTotal = hd.critical + hd.at_risk;

    // 1. Critical health concentration
    if (hd.critical > 0) {
      const pct = totalStartups > 0 ? Math.round((hd.critical / totalStartups) * 100) : 0;
      insights.push({
        id: 'critical-health',
        severity: 'critical',
        title: t('admin.insights.criticalHealthTitle'),
        description: t('admin.insights.criticalHealthDesc', {
          count: hd.critical,
          pct,
        }),
        actionLabel: t('admin.insights.reviewNow'),
        actionHref: '/my-workspaces?filter=attention',
      });
    }

    // 2. Overdue actions concentration
    if (stats.overdueActionsCount > 5) {
      insights.push({
        id: 'overdue-concentration',
        severity: 'warning',
        title: t('admin.insights.overdueTitle'),
        description: t('admin.insights.overdueDesc', {
          count: stats.overdueActionsCount,
        }),
        actionLabel: t('admin.insights.viewOverdue'),
        actionHref: '/my-workspaces?filter=attention',
      });
    }

    // 3. Missing KPIs = blind spots
    if (stats.missingKpisCount > 0 && totalStartups > 0) {
      const pct = Math.round((stats.missingKpisCount / totalStartups) * 100);
      insights.push({
        id: 'missing-kpis',
        severity: pct > 50 ? 'warning' : 'info',
        title: t('admin.insights.missingKpisTitle'),
        description: t('admin.insights.missingKpisDesc', {
          count: stats.missingKpisCount,
          pct,
        }),
        actionLabel: t('admin.insights.sendReminder'),
        actionHref: '/admin?tab=data-quality',
      });
    }

    // 4. Low session activity
    if (stats.sessionsThisWeek === 0 && totalStartups > 3) {
      insights.push({
        id: 'no-sessions',
        severity: 'warning',
        title: t('admin.insights.noSessionsTitle'),
        description: t('admin.insights.noSessionsDesc'),
      });
    }

    // 5. Pending approvals bottleneck
    if (stats.pendingApprovals >= 3) {
      insights.push({
        id: 'approvals-bottleneck',
        severity: 'warning',
        title: t('admin.insights.approvalsTitle'),
        description: t('admin.insights.approvalsDesc', {
          count: stats.pendingApprovals,
        }),
        actionLabel: t('admin.insights.reviewApprovals'),
        actionHref: '/admin?tab=users',
      });
    }

    // 6. Low mentor engagement
    if (stats.totalMentors > 0 && stats.activeMentors < stats.totalMentors * 0.3) {
      insights.push({
        id: 'mentor-engagement',
        severity: 'info',
        title: t('admin.insights.mentorEngagementTitle'),
        description: t('admin.insights.mentorEngagementDesc', {
          active: stats.activeMentors,
          total: stats.totalMentors,
        }),
      });
    }

    // 7. Positive: high health
    if (atRiskTotal === 0 && totalStartups > 0) {
      insights.push({
        id: 'all-healthy',
        severity: 'positive',
        title: t('admin.insights.allHealthyTitle'),
        description: t('admin.insights.allHealthyDesc', {
          count: totalStartups,
        }),
      });
    }

    // Return top 3 by priority (critical > warning > info > positive)
    const severityOrder: Record<InsightSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
      positive: 3,
    };
    return insights
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
      .slice(0, 3);
  }, [stats, t]);
}
