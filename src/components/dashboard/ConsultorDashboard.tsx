import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusModeProvider, FocusModeToggle, useFocusMode } from '@/components/ui/FocusModeToggle';
import { UnifiedSmartInbox } from '@/components/dashboard/UnifiedSmartInbox';
import { PortfolioPerformanceTable } from '@/components/dashboard/PortfolioPerformanceTable';
import { isToday, isThisWeek, differenceInDays, isPast } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandSurface } from '@/components/ui/BrandSurface';
import { WorkQueuePanel } from '@/components/staff/WorkQueuePanel';
import { CalendarWidget } from '@/components/dashboard/CalendarWidget';
import { useCrmPipeline, PIPELINE_STAGES } from '@/hooks/useCrmPipeline';
import { useAuth } from '@/contexts/AuthContext';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { FirstContactPrepSheet } from '@/components/consultor/FirstContactPrepSheet';

import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { ConsultorRiskPanel, type RiskItem } from './consultor/ConsultorRiskPanel';
import { ConsultorStatsBar } from './consultor/ConsultorStatsBar';
import { ConsultorPipelineSnapshot } from './consultor/ConsultorPipelineSnapshot';
import { ConsultorSessionsToday } from './consultor/ConsultorSessionsToday';
import { ConsultorCriticalActions } from './consultor/ConsultorCriticalActions';
import { ConsultorHealthMatrix } from './consultor/ConsultorHealthMatrix';
import { ConsultorWeeklyImpact, ConsultorDataAlerts } from './consultor/ConsultorWeeklyImpact';
import { NextBestActionStaff } from '@/components/dashboard/NextBestActionPanels';

interface ConsultorDashboardProps {
  workspaces: WorkspaceWithDetails[];
  isLoading: boolean;
  programsCount: number;
}

export const ConsultorDashboard = memo(function ConsultorDashboard({ workspaces, isLoading, programsCount }: ConsultorDashboardProps) {
  return (
    <FocusModeProvider defaultFocused={true}>
      <ConsultorDashboardInner workspaces={workspaces} isLoading={isLoading} programsCount={programsCount} />
    </FocusModeProvider>
  );
});

function ConsultorDashboardInner({ workspaces, isLoading, programsCount }: ConsultorDashboardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isFocused } = useFocusMode();
  const [prepSheetWorkspaceId, setPrepSheetWorkspaceId] = useState<string | null>(null);

  const { data: pipeline } = useCrmPipeline({ 
    myItemsOnly: true, 
    currentUserId: user?.id 
  });

  // Calculate risk items
  const riskItems = useMemo((): RiskItem[] => {
    if (!workspaces) return [];
    const items: RiskItem[] = [];
    const now = new Date();

    workspaces.forEach(w => {
      const health = w.health_score_override || w.health_score || 'stable';
      const daysSinceSession = w.lastSession?.scheduled_at 
        ? differenceInDays(now, new Date(w.lastSession.scheduled_at))
        : 999;

      if (health === 'critical') {
        items.push({ workspace: w, reason: t('consultor.risk.criticalHealth'), priority: 'critical' });
      } else if (health === 'at_risk') {
        items.push({ workspace: w, reason: t('consultor.risk.atRisk'), priority: 'high' });
      } else if (w.overdueActionsCount > 0) {
        items.push({ workspace: w, reason: t('consultor.risk.overdueActions', { count: w.overdueActionsCount }), priority: 'high' });
      } else if (daysSinceSession > 30) {
        items.push({ workspace: w, reason: t('consultor.risk.noRecentSession'), priority: 'medium' });
      } else if (!w.hasCurrentMonthKpi) {
        items.push({ workspace: w, reason: t('consultor.risk.missingKpis'), priority: 'medium' });
      }
    });

    const priorityOrder = { critical: 0, high: 1, medium: 2 };
    return items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 5);
  }, [workspaces, t]);

  // Stats aggregation
  const stats = useMemo(() => {
    if (!workspaces) return null;
    const healthCounts: Record<string, number> = { critical: 0, at_risk: 0, stable: 0, healthy: 0, thriving: 0 };
    let upcomingMeetingsCount = 0;
    let overdueActionsCount = 0;
    let missingKpiCount = 0;

    workspaces.forEach(w => {
      const health = (w.health_score_override || w.health_score || 'stable') as string;
      if (health in healthCounts) healthCounts[health]++;
      if (w.nextMeetingDate && isThisWeek(new Date(w.nextMeetingDate))) upcomingMeetingsCount++;
      if (w.overdueActionsCount > 0) overdueActionsCount++;
      if (!w.hasCurrentMonthKpi) missingKpiCount++;
    });

    return {
      total: workspaces.length,
      healthCounts,
      upcomingMeetingsCount,
      overdueActionsCount,
      missingKpiCount,
      needsAttention: healthCounts.critical + healthCounts.at_risk,
    };
  }, [workspaces]);

  const upcomingSessions = useMemo(() => {
    if (!workspaces) return [];
    return workspaces
      .filter(w => w.nextMeetingDate && isThisWeek(new Date(w.nextMeetingDate)))
      .sort((a, b) => new Date(a.nextMeetingDate!).getTime() - new Date(b.nextMeetingDate!).getTime())
      .slice(0, 5);
  }, [workspaces]);

  const criticalActions = useMemo(() => {
    if (!workspaces) return [];
    return workspaces
      .filter(w => w.overdueActionsCount > 0)
      .sort((a, b) => b.overdueActionsCount - a.overdueActionsCount)
      .slice(0, 5);
  }, [workspaces]);

  const pipelineSnapshot = useMemo(() => {
    if (!pipeline) return null;
    const newLeads = pipeline['new']?.length || 0;
    const contracted = pipeline['contracted']?.length || 0;
    const total = PIPELINE_STAGES.reduce((sum, stage) => sum + (pipeline[stage]?.length || 0), 0);
    const needsAction = PIPELINE_STAGES.reduce((count, stage) => {
      const items = pipeline[stage] || [];
      return count + items.filter(i => !i.next_action_at || isPast(new Date(i.next_action_at))).length;
    }, 0);
    return { newLeads, contracted, total, needsAction };
  }, [pipeline]);

  const dataAlerts = useMemo(() => {
    if (!workspaces) return [];
    const alerts: { type: string; count: number; message: string }[] = [];
    const noKpi = workspaces.filter(w => !w.hasCurrentMonthKpi).length;
    if (noKpi > 0) alerts.push({ type: 'kpi', count: noKpi, message: t('consultor.alerts.missingKpis', { count: noKpi }) });
    const noSessionLong = workspaces.filter(w => {
      if (!w.lastSession?.scheduled_at) return true;
      return differenceInDays(new Date(), new Date(w.lastSession.scheduled_at)) > 30;
    }).length;
    if (noSessionLong > 0) alerts.push({ type: 'session', count: noSessionLong, message: t('consultor.alerts.noRecentSessions', { count: noSessionLong }) });
    return alerts;
  }, [workspaces, t]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-8 w-12" /></Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Weekly Impact One-Liner */}
      <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-2.5 border border-border/40">
        {t('consultor.weekSummary', {
          defaultValue: 'Esta semana: {{sessions}} sessões · {{actions}} ações fechadas · {{health}} startups melhoraram',
          sessions: upcomingSessions.length,
          actions: criticalActions.reduce((sum, w) => sum + w.overdueActionsCount, 0),
          health: stats.healthCounts.healthy + stats.healthCounts.thriving,
        })}
      </p>

      {/* Stream F: Next Best Action (read-only, derived) */}
      <WidgetErrorBoundary name="NextBestActionStaff">
        <NextBestActionStaff
          unassignedActiveWorkspacesCount={(workspaces || []).filter(
            (w: any) => w.status === 'active' && !w.assigned_consultor_id
          ).length}
        />
      </WidgetErrorBoundary>

      <UnifiedSmartInbox overdueCount={stats.overdueActionsCount} missingKpiCount={stats.missingKpiCount} />
      <WorkQueuePanel compact={false} />

      <WidgetErrorBoundary name="ConsultorRiskPanel">
        <ConsultorRiskPanel riskItems={riskItems} onPrepSheet={setPrepSheetWorkspaceId} />
      </WidgetErrorBoundary>
      <WidgetErrorBoundary name="ConsultorStatsBar">
        <ConsultorStatsBar stats={stats} />
      </WidgetErrorBoundary>
      <WidgetErrorBoundary name="ConsultorHealthMatrix">
        <ConsultorHealthMatrix workspaces={workspaces} healthCounts={stats.healthCounts} total={stats.total} />
      </WidgetErrorBoundary>

      <WidgetErrorBoundary name="PortfolioPerformanceTable">
        <PortfolioPerformanceTable workspaces={workspaces} />
      </WidgetErrorBoundary>

      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide pt-2">
        {t('consultor.portfolioSection', { defaultValue: 'Gestão de Portefólio' })}
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        <WidgetErrorBoundary name="ConsultorPipelineSnapshot">
          <ConsultorPipelineSnapshot pipelineSnapshot={pipelineSnapshot} />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary name="ConsultorSessionsToday">
          <ConsultorSessionsToday upcomingSessions={upcomingSessions} />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary name="ConsultorCriticalActions">
          <ConsultorCriticalActions criticalActions={criticalActions} />
        </WidgetErrorBoundary>
      </div>

      {!isFocused && (
        <WidgetErrorBoundary name="ConsultorWeeklyImpact">
          <ConsultorWeeklyImpact
            sessionsCount={upcomingSessions.length}
            overdueCount={criticalActions.reduce((sum, w) => sum + w.overdueActionsCount, 0)}
            contractedCount={pipelineSnapshot?.contracted || 0}
          />
        </WidgetErrorBoundary>
      )}

      {!isFocused && <WidgetErrorBoundary name="ConsultorDataAlerts"><ConsultorDataAlerts dataAlerts={dataAlerts} /></WidgetErrorBoundary>}
      {!isFocused && <CalendarWidget />}

      {prepSheetWorkspaceId && (
        <FirstContactPrepSheet
          open={!!prepSheetWorkspaceId}
          onOpenChange={(open) => { if (!open) setPrepSheetWorkspaceId(null); }}
          workspaceId={prepSheetWorkspaceId}
        />
      )}
    </div>
  );
}
