import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  AlertTriangle,
  Calendar,
  TrendingDown,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { differenceInDays } from 'date-fns';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface ConsultantWorkloadWidgetProps {
  workspaces: WorkspaceWithDetails[];
  isLoading?: boolean;
}

export function ConsultantWorkloadWidget({
  workspaces,
  isLoading,
}: ConsultantWorkloadWidgetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const metrics = useMemo(() => {
    if (!workspaces) return null;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const activeWorkspaces = workspaces.length;

    const criticalOrAtRisk = workspaces.filter((w) => {
      const health = w.health_score_override || w.health_score;
      return health === 'critical' || health === 'at_risk';
    }).length;

    const noSessionIn30Days = workspaces.filter((w) => {
      if (!w.lastSession?.scheduled_at) return true;
      return new Date(w.lastSession.scheduled_at) < thirtyDaysAgo;
    }).length;

    const missingKpis = workspaces.filter((w) => !w.hasCurrentMonthKpi).length;

    const overdueActions = workspaces.reduce(
      (sum, w) => sum + (w.overdueActionsCount || 0),
      0
    );

    // Calculate health ratio for progress bar
    const healthyCount = workspaces.filter((w) => {
      const health = w.health_score_override || w.health_score;
      return health === 'healthy' || health === 'thriving';
    }).length;

    const healthRatio = activeWorkspaces > 0 ? (healthyCount / activeWorkspaces) * 100 : 0;

    return {
      activeWorkspaces,
      criticalOrAtRisk,
      noSessionIn30Days,
      missingKpis,
      overdueActions,
      healthRatio,
    };
  }, [workspaces]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  const stats = [
    {
      label: t('workload.activeWorkspaces'),
      value: metrics.activeWorkspaces,
      icon: <Users className="h-4 w-4" />,
      variant: 'default' as const,
    },
    {
      label: t('workload.criticalAtRisk'),
      value: metrics.criticalOrAtRisk,
      icon: <AlertTriangle className="h-4 w-4" />,
      variant: metrics.criticalOrAtRisk > 0 ? ('destructive' as const) : ('default' as const),
    },
    {
      label: t('workload.noSession30d'),
      value: metrics.noSessionIn30Days,
      icon: <Calendar className="h-4 w-4" />,
      variant: metrics.noSessionIn30Days > 0 ? ('warning' as const) : ('default' as const),
    },
    {
      label: t('workload.missingKpis'),
      value: metrics.missingKpis,
      icon: <TrendingDown className="h-4 w-4" />,
      variant: metrics.missingKpis > 0 ? ('warning' as const) : ('default' as const),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t('workload.myLoad')}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => navigate('/my-workspaces')}
          >
            {t('common.viewAll')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Portfolio Health */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('workload.portfolioHealth')}</span>
            <span className="font-medium">{Math.round(metrics.healthRatio)}% {t('workload.healthy')}</span>
          </div>
          <Progress value={metrics.healthRatio} className="h-2" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`p-3 rounded-lg border ${
                stat.variant === 'destructive'
                  ? 'border-destructive/30 bg-destructive/5'
                  : stat.variant === 'warning'
                  ? 'border-warning/50 bg-warning/50'
                  : 'bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={
                    stat.variant === 'destructive'
                      ? 'text-destructive'
                      : stat.variant === 'warning'
                      ? 'text-warning'
                      : 'text-muted-foreground'
                  }
                >
                  {stat.icon}
                </span>
                <span className="text-xl font-bold">{stat.value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Overdue Actions Alert */}
        {metrics.overdueActions > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {t('workload.totalOverdueActions', { count: metrics.overdueActions })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
