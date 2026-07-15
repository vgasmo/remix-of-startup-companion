import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Info, TrendingUp, Users, Clock, Calendar, AlertTriangle, Wrench } from 'lucide-react';

type ImpactAggregates = {
  period: { from: string | null; to: string | null };
  meetings: { completed: number; scheduled: number; cancelled: number; no_show: number };
  hours: { meeting: number; manual: number };
  startups: { supported: number };
  avg_duration: number | null;
  data_completeness: {
    missing_duration: number;
    missing_consultant: number;
    missing_participants: number;
    completeness_pct: number;
  };
};

type ToolAdoptionRow = {
  tool: string;
  entity_type: string | null;
  workspace_id: string | null;
  event_count: number;
  distinct_users: number;
  last_used_at: string | null;
};

function firstOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  source,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  hint?: string;
  source: string;
}) {
  return (
    <Card className="rounded-2xl border-border/60">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
            {hint ? <div className="text-xs text-muted-foreground mt-0.5">{hint}</div> : null}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs text-xs">
                {source}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StaffImpact() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const from = searchParams.get('from') || firstOfMonthISO();
  const to = searchParams.get('to') || todayISO();

  const setRange = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const aggregates = useQuery({
    queryKey: ['impact-aggregates', from, to],
    queryFn: async (): Promise<ImpactAggregates | null> => {
      const { data, error } = await supabase.rpc('get_impact_aggregates', {
        p_date_from: from,
        p_date_to: to,
      });
      if (error) throw error;
      return (data as unknown as ImpactAggregates) ?? null;
    },
  });

  const adoption = useQuery({
    queryKey: ['tool-adoption', from, to],
    queryFn: async (): Promise<ToolAdoptionRow[]> => {
      const { data, error } = await supabase.rpc('get_tool_adoption', {
        p_date_from: from,
        p_date_to: to,
      });
      if (error) throw error;
      return (data as unknown as ToolAdoptionRow[]) ?? [];
    },
  });

  const agg = aggregates.data;
  const aggError = aggregates.error as Error | null;

  const tools = adoption.data ?? [];

  const dqAlerts = useMemo(() => {
    if (!agg) return [];
    const d = agg.data_completeness;
    const out: { label: string; count: number }[] = [];
    if (d.missing_duration > 0)
      out.push({ label: t('impact.missingDuration', 'Sessões sem duração'), count: d.missing_duration });
    if (d.missing_consultant > 0)
      out.push({ label: t('impact.missingConsultant', 'Sessões sem consultor'), count: d.missing_consultant });
    if (d.missing_participants > 0)
      out.push({ label: t('impact.missingParticipants', 'Sessões sem participantes'), count: d.missing_participants });
    return out;
  }, [agg, t]);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              {t('impact.title', 'Impacto do Ecossistema')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('impact.subtitle', 'Métricas reais — sem estimativas ou proxies.')}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="from" className="text-xs">{t('impact.from', 'De')}</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setRange('from', e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs">{t('impact.to', 'Até')}</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setRange('to', e.target.value)}
                className="h-9 w-40"
              />
            </div>
          </div>
        </div>

        <Tabs defaultValue="executive">
          <TabsList>
            <TabsTrigger value="executive">{t('impact.tabExecutive', 'Executivo')}</TabsTrigger>
            <TabsTrigger value="quality">{t('impact.tabQuality', 'Qualidade de Dados')}</TabsTrigger>
            <TabsTrigger value="adoption">{t('impact.tabAdoption', 'Adoção de Ferramentas')}</TabsTrigger>
          </TabsList>

          <TabsContent value="executive" className="space-y-4">
            {aggregates.isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
              </div>
            ) : !agg ? (
              <Card><CardContent className="py-8 text-sm text-muted-foreground text-center">
                {t('impact.noData', 'Sem dados no período selecionado.')}
              </CardContent></Card>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard
                    icon={Calendar}
                    label={t('impact.meetingsCompleted', 'Sessões completadas')}
                    value={agg.meetings.completed}
                    hint={`${agg.meetings.scheduled} ${t('impact.scheduled', 'agendadas')}`}
                    source="sessions.status='completed' no período"
                  />
                  <MetricCard
                    icon={Clock}
                    label={t('impact.meetingHours', 'Horas de sessão')}
                    value={agg.hours.meeting.toFixed(1) + 'h'}
                    hint={`${agg.hours.manual.toFixed(1)}h ${t('impact.manualHours', 'manuais')}`}
                    source="sum(sessions.actual_duration_minutes) + time_entries (sem duplicação)"
                  />
                  <MetricCard
                    icon={Users}
                    label={t('impact.startupsSupported', 'Startups apoiadas')}
                    value={agg.startups.supported}
                    source="distinct sessions.workspace_id no período"
                  />
                  <MetricCard
                    icon={TrendingUp}
                    label={t('impact.avgDuration', 'Duração média')}
                    value={agg.avg_duration ? `${Math.round(agg.avg_duration)}m` : '—'}
                    source="avg(sessions.actual_duration_minutes) onde completado"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard
                    icon={AlertTriangle}
                    label={t('impact.cancelled', 'Canceladas')}
                    value={agg.meetings.cancelled}
                    source="sessions.status='cancelled'"
                  />
                  <MetricCard
                    icon={AlertTriangle}
                    label={t('impact.noShow', 'Faltas')}
                    value={agg.meetings.no_show}
                    source="sessions.status='no_show'"
                  />
                  <MetricCard
                    icon={Info}
                    label={t('impact.completenessPct', 'Completude')}
                    value={`${agg.data_completeness.completeness_pct.toFixed(0)}%`}
                    hint={t('impact.completenessHint', 'sessões com duração + consultor + participantes')}
                    source="1 - (missing / total)"
                  />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="quality" className="space-y-3">
            {dqAlerts.length === 0 ? (
              <Card><CardContent className="py-8 text-sm text-muted-foreground text-center">
                {t('impact.qualityAllClear', 'Sem lacunas no período.')}
              </CardContent></Card>
            ) : (
              dqAlerts.map((a) => (
                <Card key={a.label} className="rounded-2xl border-border/60">
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      {a.label}
                    </div>
                    <span className="text-sm font-semibold">{a.count}</span>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="adoption">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  {t('impact.toolAdoption', 'Utilização de ferramentas')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {adoption.isLoading ? (
                  <Skeleton className="h-32" />
                ) : tools.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center">
                    {t('impact.noToolEvents', 'Sem eventos de utilização no período.')}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {tools.map((row, idx) => (
                      <div key={`${row.tool}-${row.workspace_id ?? idx}`} className="py-2 flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">{row.tool}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.entity_type ?? '—'} · {row.distinct_users} {t('impact.users', 'utilizadores')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{row.event_count}</div>
                          {row.last_used_at ? (
                            <div className="text-xs text-muted-foreground">
                              {new Date(row.last_used_at).toLocaleDateString()}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
