import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, AlertTriangle, Clock, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { supabase } from '@/lib/supabaseClient';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useWorkspaceMomentum, type MomentumBand } from '@/hooks/useWorkspaceMomentum';

interface Metric {
  key: string;
  label: string;
  value: number | string;
  icon: any;
  tone: string;
}

function EcosystemPulseCardInner() {
  const { t } = useTranslation();

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
    },
    {
      key: 'atRisk',
      label: t('admin.pulse.atRisk', { defaultValue: 'Startups em risco' }),
      value: data?.atRisk ?? 0,
      icon: AlertTriangle,
      tone: 'text-destructive bg-destructive/10',
    },
    {
      key: 'pending',
      label: t('admin.pulse.pendingApprovals', { defaultValue: 'Aprovações pendentes' }),
      value: data?.pending ?? 0,
      icon: Clock,
      tone: 'text-warning bg-warning/10',
    },
    {
      key: 'programs',
      label: t('admin.pulse.activePrograms', { defaultValue: 'Programas ativos' }),
      value: data?.programs ?? 0,
      icon: Activity,
      tone: 'text-info bg-info/10',
    },
  ];

  return (
    <Card className="border-border/60 rounded-xl bg-gradient-to-br from-card via-card to-muted/30">
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics.map(m => {
            const Icon = m.icon;
            return (
              <div key={m.key} className="flex items-center gap-3">
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
