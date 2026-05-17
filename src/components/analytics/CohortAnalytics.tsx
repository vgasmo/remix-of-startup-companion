import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCohortAnalytics } from '@/hooks/useCohortAnalytics';
import { useWorkspaces, ALL_WORKSPACE_STATUSES } from '@/hooks/useWorkspaces';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { usePrograms } from '@/hooks/useWorkspaces';
import { useState } from 'react';
import { Users, AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { TopRisksPanel } from './TopRisksPanel';
import { getStartupStageLabel, STARTUP_STAGE_KEYS } from '@/lib/stageLabels';
import type { StartupStage } from '@/types/database';

const HEALTH_COLORS: Record<string, string> = {
  critical: '#ef4444',
  at_risk: '#f59e0b',
  stable: '#6b7280',
  healthy: '#22c55e',
  thriving: '#10b981',
};

const STAGE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export function CohortAnalytics() {
  const { t } = useTranslation();
  const [selectedProgram, setSelectedProgram] = useState<string>('all');
  const { data: programs } = usePrograms();
  const { data: stats, isLoading } = useCohortAnalytics(selectedProgram === 'all' ? undefined : selectedProgram);
  const { data: workspaces } = useWorkspaces({}, false, ALL_WORKSPACE_STATUSES);

  const aggregateStats = stats?.reduce((acc, s) => ({
    totalStartups: acc.totalStartups + s.totalStartups,
    avgPendingActions: acc.avgPendingActions + s.avgPendingActions,
    avgOverdueActions: acc.avgOverdueActions + s.avgOverdueActions,
    kpiCompletionRate: acc.kpiCompletionRate + s.kpiCompletionRate,
    healthDistribution: {
      critical: acc.healthDistribution.critical + s.healthDistribution.critical,
      at_risk: acc.healthDistribution.at_risk + s.healthDistribution.at_risk,
      stable: acc.healthDistribution.stable + s.healthDistribution.stable,
      healthy: acc.healthDistribution.healthy + s.healthDistribution.healthy,
      thriving: acc.healthDistribution.thriving + s.healthDistribution.thriving,
    },
  }), {
    totalStartups: 0,
    avgPendingActions: 0,
    avgOverdueActions: 0,
    kpiCompletionRate: 0,
    healthDistribution: { critical: 0, at_risk: 0, stable: 0, healthy: 0, thriving: 0 },
  });

  const programCount = stats?.length || 1;
  const normalizedStats = aggregateStats ? {
    ...aggregateStats,
    avgPendingActions: aggregateStats.avgPendingActions / programCount,
    avgOverdueActions: aggregateStats.avgOverdueActions / programCount,
    kpiCompletionRate: aggregateStats.kpiCompletionRate / programCount,
  } : null;

  const healthChartData = normalizedStats ? Object.entries(normalizedStats.healthDistribution)
    .filter(([_, count]) => count > 0)
    .map(([status, count]) => ({ name: status, value: count, fill: HEALTH_COLORS[status] })) : [];

  // Determine if we're viewing an acceleration-only program
  const hasAccelerationPrograms = stats?.some(s => s.programType === 'acceleration');
  const hasIncubationPrograms = stats?.some(s => s.programType !== 'acceleration');
  const isAccelerationOnly = hasAccelerationPrograms && !hasIncubationPrograms;

  const stageData = stats?.filter(s => s.programType !== 'acceleration').flatMap(s => 
    Object.entries(s.stageDistribution).map(([stage, count]) => ({
      program: s.programName,
      stage,
      count,
    }))
  ) || [];

  const weekData = stats?.filter(s => s.programType === 'acceleration').flatMap(s =>
    Object.entries(s.weekDistribution).map(([week, count]) => ({
      program: s.programName,
      week,
      count,
    }))
  ) || [];

  // Group by stage for stacked view
  const stageLabel = (stage: string) =>
    (stage as StartupStage) in STARTUP_STAGE_KEYS
      ? getStartupStageLabel(t, stage as StartupStage)
      : stage.replace(/_/g, ' ');
  const stageChartData = Array.from(new Set(stageData.map(d => d.stage))).map(stage => ({
    stage: stageLabel(stage),
    count: stageData.filter(d => d.stage === stage).reduce((sum, d) => sum + d.count, 0),
  }));

  const weekChartData = Array.from(new Set(weekData.map(d => d.week)))
    .sort((a, b) => parseInt(a.replace('S', '')) - parseInt(b.replace('S', '')))
    .map(week => ({
      week,
      count: weekData.filter(d => d.week === week).reduce((sum, d) => sum + d.count, 0),
    }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-8 w-16 bg-muted rounded mb-2" />
                <div className="h-4 w-24 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Program Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('analytics.cohortAnalytics', 'Análise de Coorte')}</h2>
        <Select value={selectedProgram} onValueChange={setSelectedProgram}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('analytics.selectProgram', 'Selecionar programa')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('analytics.allPrograms', 'Todos os Programas')}</SelectItem>
            {programs?.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t('analytics.totalStartups', 'Total de Startups')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{normalizedStats?.totalStartups || 0}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.acrossPrograms', 'em {{count}} programas', { count: stats?.length || 0 })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {t('analytics.avgOverdueActions', 'Ações Atrasadas (média)')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{normalizedStats?.avgOverdueActions.toFixed(1) || 0}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.perStartup', 'por startup')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t('analytics.avgPendingActions', 'Ações Pendentes (média)')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{normalizedStats?.avgPendingActions.toFixed(1) || 0}</div>
            <p className="text-xs text-muted-foreground">{t('analytics.perStartup', 'por startup')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {t('analytics.kpiCompletion', 'Conclusão de KPIs')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{normalizedStats?.kpiCompletionRate.toFixed(0) || 0}%</div>
            <Progress value={normalizedStats?.kpiCompletionRate || 0} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Top Risks Panel */}
      <TopRisksPanel 
        workspaces={workspaces?.map(w => ({
          id: w.id,
          startup: w.startup,
          health_label: w.health_score as any,
          last_session_date: w.lastSession?.scheduled_at || null,
          missing_kpis_count: w.hasCurrentMonthKpi ? 0 : 1,
        })) || []}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Health Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t('analytics.healthDistribution', 'Distribuição de Saúde')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={healthChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {healthChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                {t('common.noData', 'Sem dados')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stage / Week Distribution — context-aware */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {isAccelerationOnly
                ? t('analytics.weekDistribution', 'Distribuição por Semana')
                : t('analytics.stageDistribution', 'Distribuição por Fase')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isAccelerationOnly ? (
              weekChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={weekChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6">
                      {weekChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={STAGE_COLORS[index % STAGE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  {t('common.noData', 'Sem dados')}
                </div>
              )
            ) : (
              stageChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stageChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="stage" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6">
                      {stageChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={STAGE_COLORS[index % STAGE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  {t('common.noData', 'Sem dados')}
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-Program Breakdown */}
      {stats && stats.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('analytics.programBreakdown', 'Detalhe por Programa')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.map(program => (
                <div key={program.programId} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{program.programName}</h4>
                    <span className="text-sm text-muted-foreground">{program.totalStartups} startups</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('analytics.criticalAtRisk', 'Crítico/Em Risco')}</span>
                      <p className="font-medium text-red-500">
                        {program.healthDistribution.critical + program.healthDistribution.at_risk}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('analytics.healthyThriving', 'Saudável/Excelente')}</span>
                      <p className="font-medium text-green-500">
                        {program.healthDistribution.healthy + program.healthDistribution.thriving}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('analytics.avgOverdue', 'Média Atrasadas')}</span>
                      <p className="font-medium">{program.avgOverdueActions.toFixed(1)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('analytics.kpiRate', 'Taxa KPIs')}</span>
                      <p className="font-medium">{program.kpiCompletionRate.toFixed(0)}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
