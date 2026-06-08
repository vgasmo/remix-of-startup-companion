import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Activity, TrendingUp, Bug } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

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

  const errors = errorsQuery.data ?? [];
  const events = eventsQuery.data ?? [];

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

  return (
    <div className="space-y-6">
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
      </div>

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
