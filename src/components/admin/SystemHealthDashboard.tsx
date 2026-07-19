import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Activity, TrendingUp, Bug, Zap, Download, HelpCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { DownloadHtmlReportButton } from '@/components/shared/DownloadHtmlReportButton';

interface CronRunRow {
  id: string;
  job_name: string;
  status: string;
  duration_ms: number | null;
  error_summary: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ErrorRow {
  id: string;
  error_id: string;
  message: string;
  severity: string;
  url: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  event_name: string;
  role: string | null;
  created_at: string;
}

const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
  high: 'bg-warning/15 text-warning border-warning/30',
  medium: 'bg-info/15 text-info border-info/30',
  low: 'bg-muted text-muted-foreground border-border',
};

export function SystemHealthDashboard() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  const since7d = useMemo(() => subDays(new Date(), 7).toISOString(), []);
  const since24h = useMemo(() => subDays(new Date(), 1).toISOString(), []);

  const errorsQuery = useQuery({
    enabled: isAdmin,
    queryKey: ['admin', 'system-health', 'errors'],
    queryFn: async (): Promise<ErrorRow[]> => {
      const { data, error } = await supabase
        .from('client_error_logs')
        .select('id, error_id, message, severity, url, created_at')
        .gte('created_at', since7d)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ErrorRow[];
    },
    staleTime: 60_000,
  });

  const eventsQuery = useQuery({
    enabled: isAdmin,
    queryKey: ['admin', 'system-health', 'events'],
    queryFn: async (): Promise<EventRow[]> => {
      const { data, error } = await supabase
        .from('analytics_events')
        .select('id, event_name, role, created_at')
        .gte('created_at', since7d)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
    staleTime: 60_000,
  });

  const cronRunsQuery = useQuery({
    enabled: isAdmin,
    queryKey: ['admin', 'system-health', 'cron-runs'],
    queryFn: async (): Promise<CronRunRow[]> => {
      const { data, error } = await supabase
        .from('cron_job_runs')
        .select('id, job_name, status, duration_ms, error_summary, started_at, finished_at')
        .gte('started_at', since24h)
        .order('started_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CronRunRow[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const expectationsQuery = useQuery({
    enabled: isAdmin,
    queryKey: ['admin', 'system-health', 'automation-expectations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_health_expectations')
        .select('job_name, expected_cadence_seconds, grace_seconds, severity, enabled')
        .eq('enabled', true);
      if (error) throw error;
      return (data ?? []) as Array<{
        job_name: string;
        expected_cadence_seconds: number;
        grace_seconds: number;
        severity: string;
        enabled: boolean;
      }>;
    },
    staleTime: 60_000,
  });

  const errors = errorsQuery.data ?? [];
  const events = eventsQuery.data ?? [];
  const cronRuns = cronRunsQuery.data ?? [];
  const expectations = expectationsQuery.data ?? [];

  const cronUnknown = cronRunsQuery.isError || expectationsQuery.isError;

  type JobStatus = 'healthy' | 'degraded' | 'failed' | 'stale' | 'never_run' | 'unknown';
  interface JobRow {
    job: string;
    total: number;
    ok: number;
    failed: number;
    partial: number;
    lastStatus: string | null;
    lastAt: string | null;
    lastError: string | null;
    status: JobStatus;
    severity: string;
  }

  const cronByJob = useMemo<JobRow[]>(() => {
    if (cronUnknown) return [];
    const map = new Map<string, JobRow>();
    // Seed from expectations so never-run jobs are visible
    for (const exp of expectations) {
      map.set(exp.job_name, {
        job: exp.job_name,
        total: 0, ok: 0, failed: 0, partial: 0,
        lastStatus: null, lastAt: null, lastError: null,
        status: 'never_run', severity: exp.severity,
      });
    }
    for (const r of cronRuns) {
      const cur = map.get(r.job_name) ?? {
        job: r.job_name, total: 0, ok: 0, failed: 0, partial: 0,
        lastStatus: null, lastAt: null, lastError: null,
        status: 'healthy' as JobStatus, severity: 'warning',
      };
      cur.total++;
      if (r.status === 'ok') cur.ok++;
      else if (r.status === 'failed') cur.failed++;
      else if (r.status === 'partial') cur.partial++;
      if (!cur.lastAt || r.started_at > cur.lastAt) {
        cur.lastAt = r.started_at;
        cur.lastStatus = r.status;
        cur.lastError = r.error_summary;
      }
      map.set(r.job_name, cur);
    }
    // Compute status per job
    const now = Date.now();
    for (const [name, row] of map) {
      const exp = expectations.find(e => e.job_name === name);
      if (row.total === 0) {
        row.status = 'never_run';
      } else if (row.failed > 0) {
        row.status = 'failed';
      } else if (row.partial > 0) {
        row.status = 'degraded';
      } else if (exp && row.lastAt) {
        const ageSec = (now - new Date(row.lastAt).getTime()) / 1000;
        if (ageSec > exp.expected_cadence_seconds + exp.grace_seconds) {
          row.status = 'stale';
        } else {
          row.status = 'healthy';
        }
      } else {
        row.status = 'healthy';
      }
    }
    const rank: Record<JobStatus, number> = { failed: 0, stale: 1, never_run: 2, degraded: 3, unknown: 4, healthy: 5 };
    return Array.from(map.values()).sort((a, b) => rank[a.status] - rank[b.status]);
  }, [cronRuns, expectations, cronUnknown]);

  const cronFailures24h = cronByJob.filter(r => r.status === 'failed' || r.status === 'degraded' || r.status === 'stale' || r.status === 'never_run').length;

  const errors24h = errors.filter(e => e.created_at >= since24h).length;
  const critical24h = errors.filter(e => e.created_at >= since24h && (e.severity === 'critical' || e.severity === 'high'));

  const topErrors = useMemo(() => {
    const counts = new Map<string, { message: string; count: number; severity: string }>();
    for (const e of errors) {
      const key = e.message.slice(0, 140);
      const existing = counts.get(key);
      if (existing) existing.count++;
      else counts.set(key, { message: key, count: 1, severity: e.severity });
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [errors]);

  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of events) counts.set(ev.event_name, (counts.get(ev.event_name) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [events]);

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          {t('admin.systemHealth.adminOnly', { defaultValue: 'Apenas administradores podem ver esta página.' })}
        </CardContent>
      </Card>
    );
  }

  const downloadCsv = (filename: string, headers: string[], rows: (string | number | null)[][]) => {
    const escape = (v: string | number | null) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportErrors = () => downloadCsv(
    `errors-${new Date().toISOString().slice(0, 10)}.csv`,
    ['created_at', 'severity', 'error_id', 'message', 'url'],
    errors.map(e => [e.created_at, e.severity, e.error_id, e.message, e.url]),
  );

  const exportEvents = () => downloadCsv(
    `events-${new Date().toISOString().slice(0, 10)}.csv`,
    ['created_at', 'event_name', 'role'],
    events.map(e => [e.created_at, e.event_name, e.role]),
  );

  const exportCronRuns = () => downloadCsv(
    `cron-runs-${new Date().toISOString().slice(0, 10)}.csv`,
    ['started_at', 'finished_at', 'job_name', 'status', 'duration_ms', 'error_summary'],
    cronRuns.map(r => [r.started_at, r.finished_at, r.job_name, r.status, r.duration_ms, r.error_summary]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={exportErrors} disabled={errors.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {t('admin.systemHealth.exportErrors', { defaultValue: 'Exportar erros (CSV)' })}
        </Button>
        <Button variant="outline" size="sm" onClick={exportEvents} disabled={events.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {t('admin.systemHealth.exportEvents', { defaultValue: 'Exportar eventos (CSV)' })}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCronRuns} disabled={cronRuns.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {t('admin.systemHealth.exportCron', { defaultValue: 'Exportar cron (CSV)' })}
        </Button>
        <DownloadHtmlReportButton
          functionName="generate-board-pack"
          label={t('admin.systemHealth.boardPack', { defaultValue: 'Gerar Board Pack' })}
          variant="default"
          size="sm"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={<Bug className="h-4 w-4" />}
          label={t('admin.systemHealth.errors24h', { defaultValue: 'Erros (24h)' })}
          value={errors24h}
          tone={errors24h > 0 ? 'destructive' : 'muted'}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label={t('admin.systemHealth.critical24h', { defaultValue: 'Críticos (24h)' })}
          value={critical24h.length}
          tone={critical24h.length > 0 ? 'destructive' : 'muted'}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label={t('admin.systemHealth.errors7d', { defaultValue: 'Erros (7d)' })}
          value={errors.length}
          tone="muted"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={t('admin.systemHealth.events7d', { defaultValue: 'Eventos (7d)' })}
          value={events.length}
          tone="primary"
        />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label={t('admin.systemHealth.cronFailures24h', { defaultValue: 'Falhas de cron (24h)' })}
          value={cronFailures24h}
          tone={cronFailures24h > 0 ? 'destructive' : 'muted'}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {t('admin.systemHealth.automations', { defaultValue: 'Automações agendadas (24h)' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cronByJob.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t('admin.systemHealth.noCronRuns', { defaultValue: 'Sem execuções registadas nas últimas 24h.' })}
            </p>
          ) : (
            <div className="space-y-2">
              {cronByJob.map(row => {
                const tone = row.failed > 0 ? 'destructive' : row.partial > 0 ? 'warning' : 'success';
                const badgeClass =
                  tone === 'destructive' ? 'bg-destructive/15 text-destructive border-destructive/30' :
                  tone === 'warning' ? 'bg-warning/15 text-warning border-warning/30' :
                  'bg-success/15 text-success border-success/30';
                return (
                  <div key={row.job} className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs truncate">{row.job}</p>
                      {row.lastError && (
                        <p className="text-xs text-destructive truncate mt-0.5">{row.lastError}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {row.ok}/{row.total} OK
                      </span>
                      <Badge variant="outline" className={badgeClass}>
                        {row.failed > 0 ? `${row.failed} falhas` : row.partial > 0 ? `${row.partial} parciais` : 'saudável'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>


      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t('admin.systemHealth.topErrors', { defaultValue: 'Erros mais frequentes (7d)' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {t('admin.systemHealth.noErrors', { defaultValue: 'Sem erros nos últimos 7 dias.' })}
              </p>
            ) : (
              <ul className="space-y-2">
                {topErrors.map((e, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 text-sm border-b border-border/40 pb-2 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-mono text-xs">{e.message}</p>
                    </div>
                    <Badge variant="outline" className={SEVERITY_TONE[e.severity] ?? SEVERITY_TONE.low}>
                      {e.count}× · {e.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t('admin.systemHealth.recentCritical', { defaultValue: 'Erros críticos recentes' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px] pr-3">
              {critical24h.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {t('admin.systemHealth.noneCritical', { defaultValue: 'Nenhum erro crítico nas últimas 24h.' })}
                </p>
              ) : (
                <ul className="space-y-3">
                  {critical24h.slice(0, 20).map(e => (
                    <li key={e.id} className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={SEVERITY_TONE[e.severity] ?? SEVERITY_TONE.low}>
                          {e.severity}
                        </Badge>
                        <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                      </div>
                      <p className="font-mono break-words">{e.message}</p>
                      {e.url && <p className="text-muted-foreground truncate">{e.url}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t('admin.systemHealth.eventVolume', { defaultValue: 'Volume de eventos (7d)' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t('admin.systemHealth.noEvents', { defaultValue: 'Ainda não há eventos registados.' })}
            </p>
          ) : (
            <div className="space-y-2">
              {eventCounts.map(([name, count]) => {
                const max = eventCounts[0][1];
                const pct = Math.round((count / max) * 100);
                return (
                  <div key={name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono">{name}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: 'destructive' | 'muted' | 'primary' }) {
  const toneClass =
    tone === 'destructive' ? 'text-destructive' :
    tone === 'primary' ? 'text-primary' :
    'text-muted-foreground';
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <p className={`text-2xl font-semibold mt-2 ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
