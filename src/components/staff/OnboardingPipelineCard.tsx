/**
 * OnboardingPipelineCard — Read-only funnel view of workspace onboarding states.
 * Shows counts per status so admins can see pipeline health at a glance.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Users, Clock, CheckCircle2, ShieldCheck, Building2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusCount {
  status: string;
  count: number;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; colorClass: string }> = {
  imported_unclaimed: { label: 'Importadas', icon: Building2, colorClass: 'text-muted-foreground bg-muted' },
  pending: { label: 'Pendentes', icon: Clock, colorClass: 'text-warning bg-warning/10' },
  claimed: { label: 'Reclamadas', icon: Users, colorClass: 'text-info bg-info/10' },
  active: { label: 'Ativas', icon: CheckCircle2, colorClass: 'text-success bg-success/10' },
  blocked: { label: 'Bloqueadas', icon: AlertTriangle, colorClass: 'text-destructive bg-destructive/10' },
};

const PIPELINE_ORDER = ['imported_unclaimed', 'pending', 'claimed', 'active', 'blocked'];

export function OnboardingPipelineCard() {
  const { t } = useTranslation();

  const { data: statusCounts, isLoading } = useQuery({
    queryKey: ['admin-workspace-status-counts'],
    queryFn: async () => {
      // Simple count query — read-only, no mutations
      const { data, error } = await supabase
        .from('workspaces')
        .select('status');
      if (error) throw error;

      const counts: Record<string, number> = {};
      (data || []).forEach(w => {
        const s = w.status || 'unknown';
        counts[s] = (counts[s] || 0) + 1;
      });
      return counts;
    },
    staleTime: 60_000, // Cache for 1 minute
  });

  const pipeline = useMemo(() => {
    if (!statusCounts) return [];
    return PIPELINE_ORDER
      .map(status => ({
        status,
        count: statusCounts[status] || 0,
        config: STATUS_CONFIG[status] || { label: status, icon: Building2, colorClass: 'text-muted-foreground bg-muted' },
      }))
      .filter(item => item.count > 0 || ['pending', 'claimed', 'active'].includes(item.status));
  }, [statusCounts]);

  const total = useMemo(() => {
    if (!statusCounts) return 0;
    return Object.values(statusCounts).reduce((sum, c) => sum + c, 0);
  }, [statusCounts]);

  const needsAttention = useMemo(() => {
    if (!statusCounts) return 0;
    return (statusCounts['pending'] || 0) + (statusCounts['imported_unclaimed'] || 0);
  }, [statusCounts]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t('staffCockpit.onboardingPipeline', { defaultValue: 'Pipeline de Onboarding' })}
          </CardTitle>
          <div className="flex items-center gap-2">
            {needsAttention > 0 && (
              <Badge variant="secondary" className="text-xs bg-warning/10 text-warning">
                {needsAttention} {t('staffCockpit.needsAttention', { defaultValue: 'aguardam ação' })}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {total} total
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('staffCockpit.onboardingPipelineDesc', { defaultValue: 'Visão geral do estado de ativação das startups no ecossistema.' })}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-16 flex-1 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {pipeline.map((item, idx) => {
              const Icon = item.config.icon;
              const widthPercent = total > 0 ? Math.max((item.count / total) * 100, 12) : 20;
              return (
                <div key={item.status} className="flex items-center gap-1.5" style={{ flex: `${widthPercent} 0 0` }}>
                  <div className={cn(
                    'rounded-xl p-3 flex-1 min-w-0 transition-colors',
                    item.config.colorClass,
                  )}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-[10px] font-medium truncate">{item.config.label}</span>
                    </div>
                    <p className="text-xl font-bold leading-none">{item.count}</p>
                  </div>
                  {idx < pipeline.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
