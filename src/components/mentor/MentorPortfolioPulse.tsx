import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, AlertCircle, Info, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import type { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface Props {
  workspaces: WorkspaceWithDetails[];
}

type Severity = 'info' | 'warning' | 'destructive';

interface Alert {
  key: string;
  severity: Severity;
  message: string;
  startups: string[];
}

const ICON: Record<Severity, any> = {
  info: Info,
  warning: AlertTriangle,
  destructive: AlertCircle,
};

const TONE: Record<Severity, string> = {
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
};

function MentorPortfolioPulseInner({ workspaces }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const alerts = useMemo<Alert[]>(() => {
    const now = Date.now();
    const thirtyDays = 30 * 86400000;

    const staleKpis = workspaces.filter(w => !w.hasCurrentMonthKpi).map(w => w.startup?.name || '—');
    const overdue = workspaces.filter(w => (w.overdueActionsCount || 0) > 0).map(w => w.startup?.name || '—');
    const disengaged = workspaces
      .filter(w => !w.lastSession?.scheduled_at || (now - new Date(w.lastSession.scheduled_at).getTime()) > thirtyDays)
      .map(w => w.startup?.name || '—');
    const atRisk = workspaces
      .filter(w => {
        const h = w.health_score_override || w.health_score;
        return h === 'at_risk' || h === 'critical';
      })
      .map(w => w.startup?.name || '—');

    const list: Alert[] = [];
    if (atRisk.length) {
      list.push({
        key: 'atRisk',
        severity: 'destructive',
        message: t('mentor.pulse.atRisk', { defaultValue: '{{count}} startup(s) em risco', count: atRisk.length }),
        startups: atRisk,
      });
    }
    if (overdue.length) {
      list.push({
        key: 'overdue',
        severity: 'warning',
        message: t('mentor.pulse.overdue', { defaultValue: '{{count}} startup(s) com ações atrasadas', count: overdue.length }),
        startups: overdue,
      });
    }
    if (staleKpis.length) {
      list.push({
        key: 'staleKpis',
        severity: 'info',
        message: t('mentor.pulse.staleKpis', { defaultValue: '{{count}} startup(s) com KPIs desatualizados', count: staleKpis.length }),
        startups: staleKpis,
      });
    }
    if (disengaged.length) {
      list.push({
        key: 'disengaged',
        severity: 'warning',
        message: t('mentor.pulse.disengaged', { defaultValue: '{{count}} startup(s) sem sessão há mais de 30 dias', count: disengaged.length }),
        startups: disengaged,
      });
    }
    return list;
  }, [workspaces, t]);

  if (alerts.length === 0) {
    return (
      <Card className="border-success/40 bg-success/5 rounded-2xl">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-success/15 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <p className="text-sm font-medium">
            {t('mentor.pulse.allGood', { defaultValue: 'Tudo em dia — as tuas startups estão saudáveis.' })}
          </p>
        </CardContent>
      </Card>
    );
  }

  const visible = expanded ? alerts : alerts.slice(0, 3);

  const handleSeeDetails = () => {
    document.getElementById('mentor-startups-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {t('mentor.pulse.title', { defaultValue: 'Pulso do portefólio' })}
          </h3>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleSeeDetails}>
            {t('mentor.pulse.seeDetails', { defaultValue: 'Ver detalhes' })}
          </Button>
        </div>
        <ul className="space-y-2">
          {visible.map(a => {
            const Icon = ICON[a.severity];
            return (
              <li key={a.key} className="flex items-start gap-3">
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${TONE[a.severity]}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{a.message}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {a.startups.slice(0, 4).map(n => (
                      <Badge key={n} variant="outline" className="text-[10px] px-1.5 py-0">{n}</Badge>
                    ))}
                    {a.startups.length > 4 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        +{a.startups.length - 4}
                      </Badge>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {alerts.length > 3 && (
          <Button variant="ghost" size="sm" className="w-full gap-1 text-xs" onClick={() => setExpanded(v => !v)}>
            {expanded
              ? t('common.showLess', { defaultValue: 'Ver menos' })
              : t('mentor.pulse.showMore', { defaultValue: 'Ver mais ({{count}})', count: alerts.length - 3 })}
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function MentorPortfolioPulse(props: Props) {
  return (
    <WidgetErrorBoundary name="MentorPortfolioPulse">
      <MentorPortfolioPulseInner {...props} />
    </WidgetErrorBoundary>
  );
}
