import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { BellRing } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { getIntlLocale } from '@/lib/dateUtils';

interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

/** Alertas escritos pelos monitores (check_automation_health, check_email_sync_health, check_ecosystem_invariants, ...). */
export function SystemAlertsCard() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const since = subDays(new Date(), 7).toISOString();

  const { data, isLoading, isError } = useQuery({
    enabled: isAdmin,
    queryKey: ['admin', 'system-health', 'system-alerts'],
    queryFn: async (): Promise<AlertRow[]> => {
      const { data, error } = await supabase
        .from('system_alerts')
        .select('id, kind, severity, payload, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const rows = [...(data ?? [])].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
      || b.created_at.localeCompare(a.created_at),
  );
  const urgent = rows.filter(r => r.severity === 'critical' || r.severity === 'high').length;

  return (
    <Card className={urgent > 0 ? 'border-destructive/30' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BellRing className="h-4 w-4" />
          {t('admin.systemHealth.alertsTitle', 'Alertas do sistema (7 dias)')}
          {urgent > 0 && <Badge variant="destructive">{urgent}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? null : isError ? (
          <p className="text-sm text-destructive">{t('admin.systemHealth.alertsError', 'Não foi possível ler os alertas do sistema.')}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.systemHealth.alertsEmpty', 'Sem alertas nos últimos 7 dias.')}</p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-auto">
            {rows.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={r.severity === 'critical' || r.severity === 'high' ? 'destructive' : 'secondary'}>{r.severity}</Badge>
                <span className="font-medium">{r.kind}</span>
                <span className="text-muted-foreground truncate">{String(r.payload?.job ?? '')}</span>
                <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString(getIntlLocale())}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
