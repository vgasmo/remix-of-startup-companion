import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import type { FunnelItem, FunnelStage } from '@/hooks/useFunnel';
import { getFunnelStageLabel } from '@/lib/stageLabels';

interface PipelineHealthProps {
  items: FunnelItem[];
}

interface StageMetric {
  stage: FunnelStage;
  label: string;
  count: number;
  avgDaysInStage: number;
  conversionRate: number;
  staleCount: number;
}

const STAGE_ORDER: FunnelStage[] = [
  'new',
  'first_contact_booked',
  'met',
  'qualified',
  'proposal_sent',
  'negotiating',
  'contracted'
];

export function PipelineHealthCard({ items }: PipelineHealthProps) {
  const { t } = useTranslation();
  const now = new Date();

  // Calculate metrics per stage
  const stageMetrics: StageMetric[] = STAGE_ORDER.map((stage, index) => {
    const stageItems = items.filter(i => i.stage === stage);
    const nextStage = STAGE_ORDER[index + 1];
    
    // Calculate average days in stage
    const avgDaysInStage = stageItems.length > 0
      ? Math.round(
          stageItems.reduce((sum, item) => {
            return sum + differenceInDays(now, new Date(item.updated_at || item.created_at));
          }, 0) / stageItems.length
        )
      : 0;

    // Calculate conversion rate (items that moved to next stage)
    const nextStageItems = nextStage ? items.filter(i => i.stage === nextStage) : [];
    const totalAtThisOrLater = STAGE_ORDER.slice(index).reduce((sum, s) => {
      return sum + items.filter(i => i.stage === s).length;
    }, 0);
    const conversionRate = totalAtThisOrLater > 0 
      ? Math.round((nextStageItems.length / totalAtThisOrLater) * 100)
      : 0;

    // Count stale items (no activity > 14 days)
    const staleCount = stageItems.filter(item => {
      const lastActivity = item.updated_at || item.created_at;
      return differenceInDays(now, new Date(lastActivity)) > 14;
    }).length;

    return {
      stage,
      label: getFunnelStageLabel(t, stage),
      count: stageItems.length,
      avgDaysInStage,
      conversionRate: index < STAGE_ORDER.length - 1 ? conversionRate : 100,
      staleCount
    };
  });

  // Overall health metrics
  const totalActive = items.filter(i => STAGE_ORDER.includes(i.stage)).length;
  const totalStale = stageMetrics.reduce((sum, m) => sum + m.staleCount, 0);
  const overallHealthScore = totalActive > 0 
    ? Math.round(((totalActive - totalStale) / totalActive) * 100)
    : 100;

  // Velocity: items contracted in last 30 days
  const recentConversions = items.filter(i => {
    if (i.stage !== 'contracted' && i.stage !== 'incubating') return false;
    const convertedDate = new Date(i.converted_at || i.updated_at || i.created_at);
    return differenceInDays(now, convertedDate) <= 30;
  }).length;

  // Bottleneck detection
  const bottleneck = stageMetrics.reduce((worst, current) => {
    if (current.count === 0) return worst;
    const score = current.avgDaysInStage * (current.staleCount + 1);
    const worstScore = worst.avgDaysInStage * (worst.staleCount + 1);
    return score > worstScore ? current : worst;
  }, stageMetrics[0]);

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-[hsl(var(--success))]';
    if (score >= 60) return 'text-[hsl(var(--warning))]';
    return 'text-destructive';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          {t('crm.pipelineHealth.title', 'Pipeline Health')}
        </CardTitle>
        <CardDescription>
          {t('crm.pipelineHealth.subtitle', 'Real-time insights into your sales pipeline')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className={cn('text-2xl font-bold', getHealthColor(overallHealthScore))}>
              {overallHealthScore}%
            </div>
            <p className="text-xs text-muted-foreground">{t('crm.pipelineHealth.healthScore', 'Health Score')}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold text-primary">{totalActive}</div>
            <p className="text-xs text-muted-foreground">{t('crm.pipelineHealth.activeLeads', 'Active Leads')}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold text-[hsl(var(--success))]">{recentConversions}</div>
            <p className="text-xs text-muted-foreground">{t('crm.pipelineHealth.last30Days', 'Converted (30d)')}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className={cn('text-2xl font-bold', totalStale > 0 ? 'text-[hsl(var(--warning))]' : 'text-[hsl(var(--success))]')}>
              {totalStale}
            </div>
            <p className="text-xs text-muted-foreground">{t('crm.pipelineHealth.staleLeads', 'Stale Leads')}</p>
          </div>
        </div>

        {/* Stage Funnel */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            {t('crm.pipelineHealth.stageFunnel', 'Stage Funnel')}
          </h4>
          <div className="space-y-2">
            {stageMetrics.map((metric, index) => (
              <div key={metric.stage} className="flex items-center gap-2">
                <div className="w-28 text-xs text-muted-foreground truncate">{metric.label}</div>
                <div className="flex-1 flex items-center gap-2">
                  <Progress 
                    value={totalActive > 0 ? (metric.count / totalActive) * 100 : 0} 
                    className="h-6 flex-1"
                  />
                  <span className="w-8 text-sm font-medium text-right">{metric.count}</span>
                </div>
                {index < stageMetrics.length - 1 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground w-16">
                    <ArrowRight className="h-3 w-3" />
                    {metric.conversionRate}%
                  </div>
                )}
                {metric.staleCount > 0 && (
                  <Badge variant="outline" className="text-xs text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {metric.staleCount}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Insights */}
        <div className="space-y-3">
          {bottleneck && bottleneck.staleCount > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))] shrink-0" />
              <div>
                <p className="text-sm font-medium text-[hsl(var(--warning))]">
                  {t('crm.pipelineHealth.bottleneckTitle', 'Bottleneck Detected')}
                </p>
                <p className="text-xs text-[hsl(var(--warning))] mt-1">
                  {t('crm.pipelineHealth.bottleneckDesc', 
                    '{{stage}} has {{count}} stale leads averaging {{days}} days. Consider re-engaging or disqualifying.',
                    { stage: bottleneck.label, count: bottleneck.staleCount, days: bottleneck.avgDaysInStage }
                  )}
                </p>
              </div>
            </div>
          )}

          {recentConversions > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/30">
              <CheckCircle className="h-5 w-5 text-[hsl(var(--success))] shrink-0" />
              <div>
                <p className="text-sm font-medium text-[hsl(var(--success))]">
                  {t('crm.pipelineHealth.velocityTitle', 'Good Velocity')}
                </p>
                <p className="text-xs text-[hsl(var(--success))] mt-1">
                  {t('crm.pipelineHealth.velocityDesc', 
                    '{{count}} leads converted to contracted/incubating in the last 30 days.',
                    { count: recentConversions }
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
