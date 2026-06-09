import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Users,
  DollarSign,
  Target,
  Activity,
  ArrowRight,
  Zap,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useCrmPipeline, PIPELINE_STAGES } from '@/hooks/useCrmPipeline';
import { STAGE_LABELS } from '@/constants/funnelStages';
import { differenceInDays, differenceInHours, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CrmInboxItem } from '@/hooks/useCrmInbox';
import type { FunnelStage } from '@/hooks/useFunnel';

interface CrmAnalyticsDashboardProps {
  programFilter?: string;
  assigneeFilter?: string;
  myItemsOnly?: boolean;
  currentUserId?: string;
}

interface StageMetrics {
  stage: FunnelStage;
  count: number;
  avgDaysInStage: number;
  conversionRate: number;
  overdueCount: number;
}

const STAGE_TARGET_DAYS: Record<FunnelStage, number> = {
  new: 2,
  first_contact_booked: 7,
  met: 14,
  qualified: 7,
  proposal_sent: 14,
  negotiating: 21,
  intake_requested: 3,
  intake_filling: 14,
  intake_submitted: 5,
  intake_review: 7,
  intake_changes_requested: 14,
  approved_for_signature: 3,
  sent_for_signature: 14,
  contracted: 7,
  incubating: 365,
  accelerating: 365,
  rejected: 0,
  archived: 0,
};

export function CrmAnalyticsDashboard({
  programFilter,
  assigneeFilter,
  myItemsOnly,
  currentUserId,
}: CrmAnalyticsDashboardProps) {
  const { t } = useTranslation();
  const { data: pipeline, isLoading } = useCrmPipeline({
    programId: programFilter !== 'all' ? programFilter : undefined,
    assigneeId: assigneeFilter !== 'all' ? assigneeFilter : undefined,
    myItemsOnly,
    currentUserId,
  });

  const analytics = useMemo(() => {
    if (!pipeline) return null;

    const now = new Date();
    const allItems: CrmInboxItem[] = PIPELINE_STAGES.flatMap((stage) => pipeline[stage] || []);
    const activeItems = allItems.filter((i) => !['rejected', 'archived'].includes(i.stage));

    // Calculate stage metrics
    const stageMetrics: StageMetrics[] = PIPELINE_STAGES.map((stage, idx) => {
      const items = pipeline[stage] || [];
      const nextStage = PIPELINE_STAGES[idx + 1];
      const nextStageItems = nextStage ? pipeline[nextStage] || [] : [];

      const daysInStage = items.map((item) => {
        const enteredAt = item.created_at;
        return differenceInDays(now, new Date(enteredAt));
      });
      const avgDays = daysInStage.length > 0 
        ? Math.round(daysInStage.reduce((a, b) => a + b, 0) / daysInStage.length)
        : 0;

      const conversionRate = items.length > 0 && nextStageItems.length > 0
        ? Math.round((nextStageItems.length / (items.length + nextStageItems.length)) * 100)
        : 0;

      const targetDays = STAGE_TARGET_DAYS[stage];
      const overdueCount = items.filter((item) => {
        const enteredAt = item.created_at;
        return differenceInDays(now, new Date(enteredAt)) > targetDays;
      }).length;

      return {
        stage,
        count: items.length,
        avgDaysInStage: avgDays,
        conversionRate,
        overdueCount,
      };
    });

    const totalLeads = activeItems.length;
    const overdueTotal = activeItems.filter((i) => {
      if (!i.next_action_at) return false;
      return new Date(i.next_action_at) < now;
    }).length;
    const dueToday = activeItems.filter((i) => {
      if (!i.next_action_at) return false;
      const nextAction = new Date(i.next_action_at);
      return differenceInHours(nextAction, now) >= 0 && differenceInHours(nextAction, now) <= 24;
    }).length;
    const noNextAction = activeItems.filter((i) => !i.next_action_at).length;

    const contractedThisMonth = (pipeline['contracted'] || []).filter((i) => {
      const converted = i.created_at;
      return converted && differenceInDays(now, new Date(converted)) <= 30;
    }).length;

    const hotLeads = activeItems.filter((i) => calculateLeadScore(i, now) >= 70).length;
    const warmLeads = activeItems.filter((i) => {
      const score = calculateLeadScore(i, now);
      return score >= 40 && score < 70;
    }).length;
    const coldLeads = activeItems.filter((i) => calculateLeadScore(i, now) < 40).length;

    return {
      totalLeads,
      overdueTotal,
      dueToday,
      noNextAction,
      contractedThisMonth,
      hotLeads,
      warmLeads,
      coldLeads,
      stageMetrics,
      allItems: activeItems,
    };
  }, [pipeline]);

  if (isLoading || !analytics) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={Users}
          label={t('crm.analyticsDashboard.activePipeline')}
          value={analytics.totalLeads}
          subtext={t('crm.analyticsDashboard.hotWarmCold', { hot: analytics.hotLeads, warm: analytics.warmLeads, cold: analytics.coldLeads })}
          color="text-primary"
        />
        <MetricCard
          icon={AlertTriangle}
          label={t('crm.analyticsDashboard.needsAttention')}
          value={analytics.overdueTotal + analytics.noNextAction}
          subtext={t('crm.analyticsDashboard.overdueNoAction', { overdue: analytics.overdueTotal, noAction: analytics.noNextAction })}
          color="text-destructive"
          alert={analytics.overdueTotal > 0}
        />
        <MetricCard
          icon={Clock}
          label={t('crm.analyticsDashboard.dueToday')}
          value={analytics.dueToday}
          subtext={t('crm.analyticsDashboard.dueTodayDesc')}
          color="text-[hsl(var(--warning))]"
        />
        <MetricCard
          icon={CheckCircle2}
          label={t('crm.analyticsDashboard.converted30d')}
          value={analytics.contractedThisMonth}
          subtext={t('crm.analyticsDashboard.converted30dDesc')}
          color="text-[hsl(var(--success))]"
        />
      </div>

      {/* Pipeline Funnel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                {t('crm.analyticsDashboard.pipelineHealth')}
              </CardTitle>
              <CardDescription>{t('crm.analyticsDashboard.stageDistribution')}</CardDescription>
            </div>
            <Badge variant="outline">
              {t('crm.analyticsDashboard.avgCycle', { days: calculateAverageCycleTime(analytics.stageMetrics) })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.stageMetrics.filter((m) => !['rejected', 'archived', 'incubating', 'accelerating'].includes(m.stage)).map((metric, idx, arr) => {
              const targetDays = STAGE_TARGET_DAYS[metric.stage];
              const isOverTargetTime = metric.avgDaysInStage > targetDays;
              const hasOverdue = metric.overdueCount > 0;
              const isLastStage = idx === arr.length - 1;
              const stageLabel = STAGE_LABELS[metric.stage as FunnelStage] || metric.stage;

              return (
                <div key={metric.stage} className="flex items-center gap-4">
                  {/* Stage Info */}
                  <div className="w-32 shrink-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{stageLabel}</p>
                      {hasOverdue && (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0">
                          {metric.overdueCount}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {metric.count} {t('crm.analyticsDashboard.leads')}
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden relative">
                        <div
                          className={cn(
                            'h-full transition-all',
                            metric.count > 0 ? 'bg-primary/70' : 'bg-muted'
                          )}
                          style={{ width: `${Math.min(100, (metric.count / Math.max(1, analytics.totalLeads)) * 100 * 3)}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {metric.count > 0 ? metric.count : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Conversion Arrow */}
                      {!isLastStage && (
                        <div className="flex items-center gap-1 w-24 shrink-0">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className={cn(
                            'text-xs font-medium',
                            metric.conversionRate >= 50 ? 'text-[hsl(var(--success))]' : 
                            metric.conversionRate >= 25 ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground'
                          )}>
                            {metric.conversionRate}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Time in Stage */}
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className={cn(
                        'text-xs',
                        isOverTargetTime ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground'
                      )}>
                        {t('crm.analyticsDashboard.avgDaysInStage', { days: metric.avgDaysInStage })}
                        {isOverTargetTime && ` ${t('crm.analyticsDashboard.targetDays', { days: targetDays })}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Lead Scoring Legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            {t('crm.analyticsDashboard.leadScoring')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="w-10 h-10 rounded-full bg-destructive flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{analytics.hotLeads}</p>
                <p className="text-xs text-destructive">{t('crm.analyticsDashboard.hotLeads')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30">
              <div className="w-10 h-10 rounded-full bg-[hsl(var(--warning))] flex items-center justify-center">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[hsl(var(--warning))]">{analytics.warmLeads}</p>
                <p className="text-xs text-[hsl(var(--warning))]">{t('crm.analyticsDashboard.warmLeads')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">{analytics.coldLeads}</p>
                <p className="text-xs text-muted-foreground">{t('crm.analyticsDashboard.coldLeads')}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            {t('crm.analyticsDashboard.scoreExplanation')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
  alert,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  subtext: string;
  color: string;
  alert?: boolean;
}) {
  return (
    <Card className={cn(alert && 'border-destructive/50')}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn('text-3xl font-bold mt-1', color)}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
          </div>
          <div className={cn('p-2 rounded-lg bg-muted', alert && 'bg-destructive/10')}>
            <Icon className={cn('h-5 w-5', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function calculateLeadScore(item: CrmInboxItem, now: Date): number {
  let score = 50;

  const stageOrder = ['new', 'first_contact_booked', 'met', 'qualified', 'proposal_sent', 'negotiating', 'contracted'];
  const stageIndex = stageOrder.indexOf(item.stage);
  score += stageIndex * 8;

  const lastActivity = item.last_activity_at || item.created_at;
  if (lastActivity) {
    const daysSinceActivity = differenceInDays(now, new Date(lastActivity));
    if (daysSinceActivity <= 1) score += 15;
    else if (daysSinceActivity <= 7) score += 10;
    else if (daysSinceActivity <= 14) score += 5;
    else if (daysSinceActivity > 30) score -= 20;
  }

  if (item.next_action_at) {
    score += 10;
    const daysUntilAction = differenceInDays(new Date(item.next_action_at), now);
    if (daysUntilAction <= 3 && daysUntilAction >= 0) score += 5;
  } else {
    score -= 15;
  }

  if (item.next_action_at && new Date(item.next_action_at) < now) {
    const daysOverdue = differenceInDays(now, new Date(item.next_action_at));
    score -= Math.min(30, daysOverdue * 5);
  }

  return Math.max(0, Math.min(100, score));
}

function calculateAverageCycleTime(stageMetrics: StageMetrics[]): number {
  const relevantStages = stageMetrics.filter(
    (m) => !['contracted', 'rejected', 'archived', 'incubating', 'accelerating'].includes(m.stage)
  );
  if (relevantStages.length === 0) return 0;
  return Math.round(
    relevantStages.reduce((sum, m) => sum + m.avgDaysInStage, 0) / relevantStages.length
  );
}
