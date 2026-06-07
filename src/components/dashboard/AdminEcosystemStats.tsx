import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Rocket,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Clock,
  CheckCircle2,
  Activity,
  Building2,
  UserCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface EcosystemStats {
  totalStartups: number;
  activeStartups: number;
  totalMentors: number;
  activeMentors: number;
  totalConsultants: number;
  totalFounders: number;
  pendingApprovals: number;
  healthDistribution: {
    critical: number;
    at_risk: number;
    stable: number;
    healthy: number;
    thriving: number;
  };
  sessionsThisWeek: number;
  actionsCompletedThisWeek: number;
  missingKpisCount: number;
  overdueActionsCount: number;
}

interface AdminEcosystemStatsProps {
  stats: EcosystemStats;
  className?: string;
}

/**
 * Admin dashboard widget showing ecosystem health at a glance.
 * Provides quick access to areas needing attention.
 */
export function AdminEcosystemStats({ stats, className }: AdminEcosystemStatsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const healthTotal = useMemo(() => {
    return Object.values(stats.healthDistribution).reduce((a, b) => a + b, 0);
  }, [stats.healthDistribution]);

  const healthPercentages = useMemo(() => {
    if (healthTotal === 0) return stats.healthDistribution;
    return {
      critical: (stats.healthDistribution.critical / healthTotal) * 100,
      at_risk: (stats.healthDistribution.at_risk / healthTotal) * 100,
      stable: (stats.healthDistribution.stable / healthTotal) * 100,
      healthy: (stats.healthDistribution.healthy / healthTotal) * 100,
      thriving: (stats.healthDistribution.thriving / healthTotal) * 100,
    };
  }, [stats.healthDistribution, healthTotal]);

  const needsAttention = stats.healthDistribution.critical + stats.healthDistribution.at_risk;
  const healthyCount = stats.healthDistribution.healthy + stats.healthDistribution.thriving;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            {t('admin.stats.ecosystemOverview')}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/ecosystem')}>
            {t('common.viewAll')}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Rocket className="h-4 w-4" />
              <span className="text-xs">{t('admin.stats.startups')}</span>
            </div>
            <p className="text-xl font-bold">{stats.activeStartups}</p>
            <p className="text-xs text-muted-foreground">
              {t('admin.stats.ofTotal', { total: stats.totalStartups })}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-accent/5 border border-accent/10">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">{t('admin.stats.mentors')}</span>
            </div>
            <p className="text-xl font-bold">{stats.activeMentors}</p>
            <p className="text-xs text-muted-foreground">
              {t('admin.stats.active')}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <UserCheck className="h-4 w-4" />
              <span className="text-xs">{t('admin.stats.consultants')}</span>
            </div>
            <p className="text-xl font-bold">{stats.totalConsultants}</p>
          </div>

          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs">{t('admin.stats.founders')}</span>
            </div>
            <p className="text-xl font-bold">{stats.totalFounders}</p>
          </div>
        </div>

        {/* Health Distribution Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('admin.portfolioHealth')}</span>
            <div className="flex items-center gap-3 text-xs">
              {needsAttention > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {needsAttention} {t('admin.needAttention')}
                </Badge>
              )}
              {healthyCount > 0 && (
                <Badge variant="outline" className="text-xs text-success border-success/30 bg-success/5">
                  {healthyCount} {t('admin.stats.thriving')}
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {Object.entries(healthPercentages).map(([health, percentage]) => {
              if (percentage === 0) return null;
              const colors: Record<string, string> = {
                critical: 'bg-health-critical',
                at_risk: 'bg-health-at-risk',
                stable: 'bg-health-stable',
                healthy: 'bg-health-healthy',
                thriving: 'bg-health-thriving',
              };
              return (
                <Tooltip key={health}>
                  <TooltipTrigger asChild>
                    <div 
                      className={`${colors[health]} transition-all hover:opacity-80`}
                      style={{ width: `${percentage}%` }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t(`health.levels.${health}`)}: {stats.healthDistribution[health as keyof typeof stats.healthDistribution]}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Attention Needed */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <Button
            variant="ghost"
            className={cn(
              'h-auto py-3 flex-col items-start',
              stats.pendingApprovals > 0 && 'bg-warning/5 border border-warning/30'
            )}
            onClick={() => navigate('/admin')}
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {t('admin.pendingApprovals')}
            </div>
            <span className={cn('text-lg font-bold', stats.pendingApprovals > 0 && 'text-warning')}>
              {stats.pendingApprovals}
            </span>
          </Button>

          <Button
            variant="ghost"
            className={cn(
              'h-auto py-3 flex-col items-start',
              stats.overdueActionsCount > 0 && 'bg-destructive/5 border border-destructive/30'
            )}
            onClick={() => navigate('/ecosystem?filter=overdue')}
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('admin.stats.overdueActions')}
            </div>
            <span className={cn('text-lg font-bold', stats.overdueActionsCount > 0 && 'text-destructive')}>
              {stats.overdueActionsCount}
            </span>
          </Button>

          <Button
            variant="ghost"
            className="h-auto py-3 flex-col items-start"
            onClick={() => navigate('/ecosystem?filter=missing-kpis')}
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              {t('admin.stats.missingKpis')}
            </div>
            <span className="text-lg font-bold">{stats.missingKpisCount}</span>
          </Button>
        </div>

        {/* Weekly Activity */}
        <div className="flex items-center justify-between pt-2 border-t text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{stats.sessionsThisWeek} {t('admin.stats.sessionsThisWeek')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>{stats.actionsCompletedThisWeek} {t('admin.stats.actionsCompleted')}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
