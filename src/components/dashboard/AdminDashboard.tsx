import { useTranslation } from 'react-i18next';
import { clickableProps } from '@/lib/clickable';

import { useNavigate } from 'react-router-dom';
import {
  Clock,
  FileText,
  AlertTriangle,
  Building2,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Users,
  TrendingUp,
  Minus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Sparkline } from '@/components/ui/Sparkline';
import { BrandSurface } from '@/components/ui/BrandSurface';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminDashboardStats } from '@/hooks/useAdminDashboardStats';
import { useEcosystemInsights } from '@/hooks/useEcosystemInsights';
import { EcosystemInsights } from '@/components/dashboard/EcosystemInsights';
import { EcosystemHeatmap } from '@/components/admin/EcosystemHeatmap';
import { ExportAnalyticsModal } from '@/components/admin/ExportAnalyticsModal';
import type { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface AdminDashboardProps {
  workspaces: WorkspaceWithDetails[];
  isLoading: boolean;
  programsCount: number;
  onSwitchToPortfolio: () => void;
}

import { memo, useMemo, useState } from 'react';

export const AdminDashboard = memo(function AdminDashboard({ workspaces, isLoading: workspacesLoading, programsCount, onSwitchToPortfolio }: AdminDashboardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: stats, isLoading: statsLoading } = useAdminDashboardStats();

  const [showExport, setShowExport] = useState(false);
  const isLoading = workspacesLoading || statsLoading;

  const { healthDistribution, overdueCount, totalOverdueActions, needsAttention } = useMemo(() => {
    const dist = { critical: 0, at_risk: 0, stable: 0, healthy: 0, thriving: 0 };
    let totalOverdue = 0;
    let wsOverdue = 0;
    workspaces.forEach(w => {
      const h = (w.health_score_override || w.health_score || 'stable') as keyof typeof dist;
      if (h in dist) dist[h]++;
      if (w.overdueActionsCount > 0) wsOverdue++;
      totalOverdue += (w.overdueActionsCount || 0);
    });
    return {
      healthDistribution: dist,
      overdueCount: wsOverdue,
      totalOverdueActions: totalOverdue,
      needsAttention: dist.critical + dist.at_risk,
    };
  }, [workspaces]);

  const insights = useEcosystemInsights({
    totalStartups: workspaces.length,
    activeStartups: workspaces.length,
    healthDistribution,
    overdueActionsCount: totalOverdueActions,
    missingKpisCount: 0,
    sessionsThisWeek: 0,
    pendingApprovals: stats?.pendingApprovalsCount ?? 0,
    totalMentors: 0,
    activeMentors: 0,
    totalConsultants: 0,
  });

  const signals: Array<{ key: string; label: string; value: number | string; icon: any; href: string; variant: 'default' | 'info' | 'warning' | 'destructive'; trend: 'up' | 'down' | 'neutral'; sparkData: number[] }> = [
    {
      key: 'approvals',
      label: t('admin.pendingApprovals'),
      value: stats?.pendingApprovalsCount ?? 0,
      icon: Users,
      href: '/admin?tab=users',
      variant: 'warning' as const,
      trend: 'up' as const,
      sparkData: [2, 3, 1, 4, 2, stats?.pendingApprovalsCount ?? 0],
    },
    {
      key: 'renewals',
      label: t('admin.contractRenewals'),
      value: stats?.contractRenewals30d ?? 0,
      icon: FileText,
      href: '/admin?tab=backoffice',
      variant: 'info' as const,
      trend: 'neutral' as const,
      sparkData: [1, 2, 1, 3, 2, stats?.contractRenewals30d ?? 0],
    },
    {
      key: 'occupancy',
      label: t('admin.occupancy'),
      value: stats ? `${stats.occupiedSpaces}/${stats.totalSpaces}` : '—',
      icon: Building2,
      href: '/admin?tab=backoffice',
      variant: 'default' as const,
      trend: 'neutral' as const,
      sparkData: stats ? [
        Math.max(stats.occupiedSpaces - 2, 0),
        Math.max(stats.occupiedSpaces - 1, 0),
        stats.occupiedSpaces,
        stats.occupiedSpaces,
        stats.occupiedSpaces,
        stats.occupiedSpaces
      ] : [0, 0, 0, 0, 0, 0],
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  const exceptionAlerts = signals.filter(s => typeof s.value === 'number' && s.value > 0 && s.variant !== 'default');

  const hour = new Date().getHours();
  const greetingKey =
    hour < 12 ? 'admin.hero.morning'
    : hour < 19 ? 'admin.hero.afternoon'
    : 'admin.hero.evening';
  const greetingDefault =
    hour < 12 ? 'Bom dia{{name}}'
    : hour < 19 ? 'Boa tarde{{name}}'
    : 'Boa noite{{name}}';
  const firstName = profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : '';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. GREETING HERO — branded surface, absorbs the Command Center header */}
      <BrandSurface
        intensity="hero"
        className="surface-hero rounded-2xl p-4 sm:p-7 overflow-hidden animate-fade-in-up stagger-1"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-2 min-w-0">
            <p className="label-eyebrow">
              {t('admin.commandCenter')}
            </p>
            <h1 className="text-display text-foreground break-words">
              {t(greetingKey, { defaultValue: greetingDefault, name: firstName })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('admin.ecosystemSummary', {
                startups: workspaces.length,
                programs: programsCount,
              })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onSwitchToPortfolio} className="gap-2 shrink-0">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">{t('admin.portfolioView')}</span>
          </Button>
        </div>
      </BrandSurface>

      {/* HERO: Exception-Based Alerts */}
      {exceptionAlerts.length > 0 && (
        <Card className="rounded-2xl border-warning/40 bg-gradient-to-r from-warning/10 via-warning/5 to-transparent">
          <CardContent className="p-4">
            <p className="label-eyebrow text-warning mb-3">
              {t('admin.exceptionsTitle', { defaultValue: 'Requires Your Attention' })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {exceptionAlerts.map((alert) => {
                const Icon = alert.icon;
                return (
                  <div
                    key={alert.key}
                    className="flex items-center gap-3 p-3 rounded-xl bg-background/80 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all duration-200"
                    {...clickableProps(() => navigate(alert.href))}
                  >
                    <div className={cn(
                      'h-9 w-9 rounded-xl flex items-center justify-center shrink-0',
                      alert.variant === 'destructive' ? 'bg-destructive/10' : 'bg-warning/15'
                    )}>
                      <Icon className={cn(
                        'h-4 w-4',
                        alert.variant === 'destructive' ? 'text-destructive' : 'text-warning'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">{alert.value as number}</p>
                      <p className="text-xs text-muted-foreground truncate">{alert.label}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signal Cards — Enterprise Command Center style */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {signals.map((signal) => {
          const Icon = signal.icon;
          const hasAlert = typeof signal.value === 'number' && signal.value > 0 && signal.variant !== 'default';
          const TrendIcon = signal.trend === 'up' ? ArrowUpRight : signal.trend === 'down' ? ArrowDownRight : Minus;
          const trendColor = signal.variant === 'destructive' && signal.trend === 'up'
            ? 'text-destructive'
            : signal.trend === 'up'
            ? 'text-success'
            : signal.trend === 'down'
            ? 'text-success'
            : 'text-muted-foreground';

          return (
            <Card
              key={signal.key}
              className={cn(
                'group cursor-pointer transition-all duration-200 rounded-2xl hover:shadow-md hover:scale-[1.01]',
                hasAlert && signal.variant === 'destructive' && 'border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent',
                hasAlert && signal.variant === 'warning' && 'border-warning/40 bg-gradient-to-br from-warning/10 to-transparent',
              )}
              onClick={() => navigate(signal.href)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <div className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center',
                    hasAlert && signal.variant === 'destructive' ? 'bg-destructive/10' :
                    hasAlert && signal.variant === 'warning' ? 'bg-warning/15' :
                    'bg-muted/50'
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-medium flex-1">{signal.label}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <span className={cn(
                      'text-2xl font-bold block',
                      hasAlert && signal.variant === 'destructive' && 'text-destructive',
                      hasAlert && signal.variant === 'warning' && 'text-warning',
                    )}>
                      {signal.value}
                    </span>
                    <div className={cn('flex items-center gap-0.5 text-xs mt-0.5', trendColor)}>
                      <TrendIcon className="h-3 w-3" />
                      <span className="text-[10px]">30d</span>
                    </div>
                  </div>
                  <Sparkline
                    data={signal.sparkData}
                    width={56}
                    height={24}
                    color={
                      hasAlert && signal.variant === 'destructive' ? 'hsl(var(--destructive))' :
                      hasAlert && signal.variant === 'warning' ? 'hsl(var(--warning))' :
                      'hsl(var(--muted-foreground))'
                    }
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Smart Insights */}
      <EcosystemInsights insights={insights} />

      {/* Ecosystem Heatmap */}
      <EcosystemHeatmap workspaces={workspaces} onExport={() => setShowExport(true)} />
      <ExportAnalyticsModal open={showExport} onOpenChange={setShowExport} />

      {/* Portfolio Health Summary */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            {t('admin.portfolioHealth')}
            {needsAttention > 0 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                {needsAttention} {t('admin.needAttention')}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(healthDistribution).map(([health, count]) => {
              const colors: Record<string, string> = {
                critical: 'bg-health-critical',
                at_risk: 'bg-health-at-risk',
                stable: 'bg-health-stable',
                healthy: 'bg-health-healthy',
                thriving: 'bg-health-thriving',
              };
              const isAlert = health === 'critical' || health === 'at_risk';
              return (
                <div key={health} className={cn(
                  "text-center p-2 rounded-xl transition-all duration-200 hover:shadow-sm cursor-pointer",
                  isAlert && count > 0 && 'bg-destructive/5 ring-1 ring-destructive/20'
                )}
                  {...clickableProps(() => navigate('/my-workspaces?filter=attention'))}
                >

                  <div className={cn('h-2 rounded-full mb-2', colors[health])} />
                  <p className={cn('text-lg font-bold', isAlert && count > 0 && 'text-destructive')}>{count}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {t(`health.levels.${health}`, health)}
                  </p>
                </div>
              );
            })}
          </div>
          {overdueCount > 0 && (
            <div className="mt-4 pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => navigate('/my-workspaces?filter=attention')}
              >
                <Clock className="h-4 w-4 mr-2" />
                {t('admin.overdueStartups', { count: overdueCount })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Onboarding Pipeline Summary */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            {t('admin.onboardingPipeline', { defaultValue: 'Pipeline de Onboarding' })}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('admin.onboardingPipelineDesc', { defaultValue: 'Distribuição atual de startups por estado de ativação.' })}
          </p>
        </CardHeader>
        <CardContent>
          {(() => {
            const statusCounts = { active: 0, claimed: 0, pending: 0, onboarding: 0, other: 0 };
            workspaces.forEach(w => {
              const s = (w as any).status as string || 'active';
              if (s in statusCounts) (statusCounts as any)[s]++;
              else statusCounts.other++;
            });
            const items = [
              { key: 'active', label: t('admin.statusActive', { defaultValue: 'Ativas' }), count: statusCounts.active, color: 'bg-health-healthy' },
              { key: 'claimed', label: t('admin.statusClaimed', { defaultValue: 'Claimed' }), count: statusCounts.claimed, color: 'bg-health-at-risk' },
              { key: 'pending', label: t('admin.statusPending', { defaultValue: 'Pendentes' }), count: statusCounts.pending, color: 'bg-health-stable' },
              { key: 'onboarding', label: t('admin.statusOnboarding', { defaultValue: 'Onboarding' }), count: statusCounts.onboarding, color: 'bg-primary' },
            ];
            return (
              <div className="grid grid-cols-4 gap-3">
                {items.map(item => (
                  <div key={item.key} className="text-center p-3 rounded-xl bg-muted/30">
                    <div className={cn('h-2 rounded-full mb-2 mx-auto w-8', item.color)} />
                    <p className="text-xl font-bold">{item.count}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {[
          { label: t('staffCockpit.navLabel', { defaultValue: 'Painel' }), href: '/staff-cockpit', icon: TrendingUp, desc: t('admin.commandCenterDesc', { defaultValue: 'Triage diária e visão operacional' }) },
          { label: t('admin.crmPipeline'), href: '/crm', icon: Users, desc: t('admin.crmDesc', { defaultValue: 'Pipeline comercial' }) },
          { label: t('admin.spaceOps', { defaultValue: 'Operações de Espaço' }), href: '/admin?tab=backoffice', icon: Building2, desc: t('admin.spaceOpsDesc', { defaultValue: 'Contratos, faturas e infra' }) },
          { label: t('admin.programs'), href: '/admin?tab=programs-setup', icon: FileText, desc: t('admin.programsDesc', { defaultValue: 'Configuração de programas' }) },
          { label: t('admin.reports'), href: '/admin?tab=analytics', icon: AlertTriangle, desc: t('admin.reportsDesc', { defaultValue: 'Relatórios e métricas' }) },
        ].map((link) => {
          const Icon = link.icon;
          return (
            <Button
              key={link.href}
              variant="outline"
              className="h-auto py-3 px-3 flex-col items-start gap-1 rounded-xl hover:shadow-sm hover:scale-[1.01] transition-all duration-200 text-left"
              onClick={() => navigate(link.href)}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{link.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-normal">{link.desc}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
});
