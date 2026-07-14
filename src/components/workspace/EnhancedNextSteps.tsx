import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, differenceInDays, isThisMonth } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import {
  Zap,
  TrendingUp,
  CheckCircle2,
  ClipboardList,
  Calendar,
  FileText,
  AlertTriangle,
  ChevronRight,
  Plus,
  Send,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkspaceActions, useWorkspaceKpis, useWorkspaceNextSession } from '@/hooks/useWorkspaceData';
import { usePendingCheckin } from '@/hooks/useCheckins';
import { useInvestorUpdates } from '@/hooks/useInvestorUpdates';
import { QuickKpiModal } from '@/components/workspace/QuickKpiModal';

interface EnhancedNextStepsProps {
  workspaceId: string;
  programId: string;
  stage: string;
  canWrite: boolean;
}

interface StepItem {
  id: string;
  type: 'action' | 'kpi' | 'checkin' | 'session' | 'playbook' | 'investor_update';
  priority: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  variant: 'destructive' | 'warning' | 'default' | 'success';
  actionLabel: string;
  onAction: () => void;
}

export function EnhancedNextSteps({ workspaceId, programId, stage, canWrite }: EnhancedNextStepsProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [, setSearchParams] = useSearchParams();
  const [showQuickKpi, setShowQuickKpi] = useState(false);

  const { data: actions } = useWorkspaceActions(workspaceId);
  const { data: kpiData } = useWorkspaceKpis(workspaceId);
  const { data: nextSession } = useWorkspaceNextSession(workspaceId);
  const { data: pendingCheckin } = usePendingCheckin(workspaceId);
  const { data: investorUpdates } = useInvestorUpdates(workspaceId);

  const steps = useMemo<StepItem[]>(() => {
    const items: StepItem[] = [];
    const today = new Date();

    // 1. Overdue actions (highest priority)
    const overdueActions = actions?.filter(
      (a) => a.due_date && new Date(a.due_date) < today && a.status !== 'completed' && a.status !== 'awaiting_validation' && a.status !== 'cancelled'
    ) || [];

    if (overdueActions.length > 0) {
      const topOverdue = overdueActions.slice(0, 3);
      topOverdue.forEach((action, idx) => {
        items.push({
          id: `overdue-${action.id}`,
          type: 'action',
          priority: idx + 1,
          title: action.title,
          description: t('nextSteps.overdueDays', {
            days: differenceInDays(today, new Date(action.due_date!)),
          }),
          icon: <AlertTriangle className="h-5 w-5" />,
          variant: 'destructive',
          actionLabel: t('nextSteps.complete'),
          onAction: () => setSearchParams({ tab: 'milestones-actions' }),
        });
      });
    }

    // 2. Missing required KPIs for current month
    const hasCurrentMonthKpis = kpiData?.current.some(
      (k) => k.period_month && isThisMonth(new Date(k.period_month))
    );

    if (!hasCurrentMonthKpis && items.length < 5) {
      items.push({
        id: 'missing-kpis',
        type: 'kpi',
        priority: 10,
        title: t('nextSteps.updateKpis'),
        description: t('nextSteps.kpisForMonth', { month: format(today, 'MMMM', { locale: dateLocale }) }),
        icon: <TrendingUp className="h-5 w-5" />,
        variant: 'warning',
        actionLabel: t('nextSteps.addNow'),
        onAction: () => setShowQuickKpi(true),
      });
    }

    // 3. Pending check-in
    if (pendingCheckin && items.length < 5) {
      items.push({
        id: 'pending-checkin',
        type: 'checkin',
        priority: 15,
        title: t('nextSteps.weeklyCheckin'),
        description: t('nextSteps.dueOn', {
          date: format(new Date(pendingCheckin.due_date), 'EEEE'),
        }),
        icon: <ClipboardList className="h-5 w-5" />,
        variant: 'warning',
        actionLabel: t('nextSteps.completeNow'),
        onAction: () => setSearchParams({ tab: 'overview' }),
      });
    }

    // 4. No investor update in last 30 days
    const recentUpdate = investorUpdates?.find((u) => {
      const updateDate = new Date(u.created_at);
      return differenceInDays(today, updateDate) <= 30;
    });

    if (!recentUpdate && items.length < 5) {
      items.push({
        id: 'investor-update',
        type: 'investor_update',
        priority: 20,
        title: t('nextSteps.createInvestorUpdate'),
        description: t('nextSteps.noRecentUpdate'),
        icon: <FileText className="h-5 w-5" />,
        variant: 'default',
        actionLabel: t('nextSteps.create'),
        onAction: () => setSearchParams({ tab: 'dataroom' }),
      });
    }

    // 5. Upcoming session prep
    if (nextSession && items.length < 5) {
      const sessionDate = new Date(nextSession.starts_at);
      const daysUntil = differenceInDays(sessionDate, today);

      if (daysUntil <= 2 && daysUntil >= 0) {
        items.push({
          id: 'session-prep',
          type: 'session',
          priority: 25,
          title: t('nextSteps.prepareSession'),
          description: nextSession.title,
          icon: <Calendar className="h-5 w-5" />,
          variant: 'default',
          actionLabel: t('nextSteps.prepare'),
          onAction: () => setSearchParams({ tab: 'agenda' }),
        });
      }
    }

    // 6. In-progress high priority actions
    const highPriorityInProgress =
      actions?.filter((a) => a.status === 'in_progress' && a.priority === 'high') || [];

    if (highPriorityInProgress.length > 0 && items.length < 5) {
      items.push({
        id: 'high-priority',
        type: 'action',
        priority: 30,
        title: highPriorityInProgress[0].title,
        description: t('nextSteps.highPriorityInProgress'),
        icon: <CheckCircle2 className="h-5 w-5" />,
        variant: 'default',
        actionLabel: t('nextSteps.continue'),
        onAction: () => setSearchParams({ tab: 'milestones-actions' }),
      });
    }

    return items.sort((a, b) => a.priority - b.priority).slice(0, 5);
  }, [actions, kpiData, nextSession, pendingCheckin, investorUpdates, setSearchParams, t]);

  if (steps.length === 0) {
    return (
      <Card className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/50 ">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[hsl(var(--success))]" />
            </div>
            <div>
              <h3 className="font-semibold text-[hsl(var(--success))]">
                {t('nextSteps.allCaughtUp')}
              </h3>
              <p className="text-sm text-[hsl(var(--success))]">
                {t('nextSteps.greatProgress')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {t('nextSteps.title')}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {steps.length} {t('nextSteps.items')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                step.variant === 'destructive'
                  ? 'border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/30 hover:bg-[hsl(var(--warning))]/50'
                  : step.variant === 'warning'
                  ? 'border-border bg-muted/30 hover:bg-muted/50'
                  : 'border-border/50 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-background text-sm font-medium border">
                  {index + 1}
                </div>
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    step.variant === 'destructive'
                      ? 'bg-[hsl(var(--warning))]/50 text-[hsl(var(--warning))] '
                      : step.variant === 'warning'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{step.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                </div>
              </div>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={step.onAction}
                  className="gap-1 flex-shrink-0"
                >
                  {step.actionLabel}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <QuickKpiModal
        open={showQuickKpi}
        onOpenChange={setShowQuickKpi}
        workspaceId={workspaceId}
        programId={programId}
      />
    </>
  );
}
