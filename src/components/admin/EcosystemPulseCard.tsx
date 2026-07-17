import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, AlertTriangle, Clock, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { supabase } from '@/lib/supabaseClient';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useWorkspaceMomentum, type MomentumBand } from '@/hooks/useWorkspaceMomentum';
import { clickableProps } from '@/lib/clickable';

interface Metric {
  key: string;
  label: string;
  value: number | string;
  icon: any;
  tone: string;
  href?: string;
}

function EcosystemPulseCardInner() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-ecosystem-pulse'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [contracts, atRisk, pending, programs] = await Promise.allSettled([
        supabase
          .from('startup_contracts' as any)
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),
        supabase
          .from('workspaces')
          .select('id', { count: 'exact', head: true })
          .in('health_score', ['at_risk', 'critical']),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('account_status', 'pending'),
        supabase
          .from('programs')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
      ]);
      const getCount = (r: PromiseSettledResult<any>) =>
        r.status === 'fulfilled' ? (r.value?.count ?? 0) : 0;
      return {
        contracts: getCount(contracts),
        atRisk: getCount(atRisk),
        pending: getCount(pending),
        programs: getCount(programs),
        today,
      };
    },
  });

  const metrics: Metric[] = [
    {
      key: 'contracts',
      label: t('admin.pulse.activeContracts', { defaultValue: 'Contratos ativos' }),
      value: data?.contracts ?? 0,
      icon: FileText,
      tone: 'text-primary bg-primary/10',
      href: '/admin?tab=backoffice&section=contracts',
    },
    {
      key: 'atRisk',
      label: t('admin.pulse.atRisk', { defaultValue: 'Startups em risco' }),
      value: data?.atRisk ?? 0,
      icon: AlertTriangle,
      tone: 'text-destructive bg-destructive/10',
      href: '/my-workspaces?filter=attention',
    },
    {
      key: 'pending',
      label: t('admin.pulse.pendingApprovals', { defaultValue: 'Aprovações pendentes' }),
      value: data?.pending ?? 0,
      icon: Clock,
      tone: 'text-warning bg-warning/10',
      href: '/admin?tab=approvals',
    },
    {
      key: 'programs',
      label: t('admin.pulse.activePrograms', { defaultValue: 'Programas ativos' }),
      value: data?.programs ?? 0,
      icon: Activity,
      tone: 'text-info bg-info/10',
      href: '/admin?tab=programs-setup',
    },
  ];

  // Lightweight momentum distribution (reuses existing useWorkspaces cache).
  const { data: workspaces = [] } = useWorkspaces();
  const momentumResults = useWorkspaceMomentum(workspaces);
  const momentumDist = useMemo(() => {
    const counts: Record<MomentumBand, number> = { strong: 0, steady: 0, slowing: 0, at_risk: 0 };
    for (const m of momentumResults) counts[m.band]++;
    return counts;
  }, [momentumResults]);

  const momentumStrip: Array<{ band: MomentumBand; label: string; tone: string }> = [
    { band: 'strong', label: t('admin.pulse.momentum.strong', { defaultValue: 'Forte' }), tone: 'text-success bg-success/10' },
    { band: 'steady', label: t('admin.pulse.momentum.steady', { defaultValue: 'Estável' }), tone: 'text-info bg-info/10' },
    { band: 'slowing', label: t('admin.pulse.momentum.slowing', { defaultValue: 'A abrandar' }), tone: 'text-warning bg-warning/10' },
    { band: 'at_risk', label: t('admin.pulse.momentum.atRisk', { defaultValue: 'Em risco' }), tone: 'text-destructive bg-destructive/10' },
  ];

  return (
    <Card className="border-border/60 rounded-xl bg-gradient-to-br from-card via-card to-muted/30">
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics.map(m => {
            const Icon = m.icon;
            const interactive = m.href
              ? clickableProps<HTMLDivElement>(() => navigate(m.href!), { label: `${m.label}: ${m.value}` })
              : {};
            return (
              <div
                key={m.key}
                {...interactive}
                className={`flex items-center gap-3 rounded-md -mx-1 px-1 py-1 ${m.href ? 'cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors' : ''}`}
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${m.tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{m.label}</p>
                  {isLoading ? (
                    <Skeleton className="h-7 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-semibold tabular-nums leading-tight">{m.value}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {momentumResults.length > 0 && (
          <div className="pt-3 border-t border-border/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              {t('admin.pulse.momentum.title', { defaultValue: 'Distribuição de momentum' })}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {momentumStrip.map(s => (
                <div key={s.band} className={`rounded-md px-2 py-1.5 ${s.tone}`}>
                  <p className="text-[10px] opacity-80 truncate">{s.label}</p>
                  <p className="text-lg font-semibold tabular-nums leading-tight">{momentumDist[s.band]}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EcosystemPulseCard() {
  return (
    <WidgetErrorBoundary name="EcosystemPulseCard">
      <EcosystemPulseCardInner />
    </WidgetErrorBoundary>
  );
}
