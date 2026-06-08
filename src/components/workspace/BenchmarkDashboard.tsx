import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { BarChart3, Users, ArrowUp, ArrowDown, Minus, Activity, Sparkles } from 'lucide-react';

interface CohortBenchmark {
  program_id: string;
  stage: string;
  metric_key: string;
  metric_label: string | null;
  cohort_size: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  avg: number | null;
}

interface BenchmarkDashboardProps {
  workspaceId: string;
  programId?: string;
  currentStage?: string;
  myHealthScore?: number | null;
  myMilestonesCompleted?: number;
  myActionsCompleted?: number;
}

function useCohortBenchmarks(programId?: string, stage?: string) {
  return useQuery({
    queryKey: ['cohort-benchmarks', programId, stage],
    queryFn: async (): Promise<CohortBenchmark[]> => {
      if (!programId || !stage) return [];
      const { data, error } = await supabase
        .from('cohort_benchmarks')
        .select('*')
        .eq('program_id', programId)
        .eq('stage', stage);
      if (error) throw error;
      return (data || []) as CohortBenchmark[];
    },
    enabled: !!programId && !!stage,
    staleTime: 30 * 60_000,
  });
}

function bandForValue(value: number, b: CohortBenchmark): { label: string; tone: 'success' | 'warning' | 'muted' | 'destructive'; pct: number } {
  // determine which percentile band the user falls into
  if (b.p90 != null && value >= b.p90) return { label: 'p90+', tone: 'success', pct: 95 };
  if (b.p75 != null && value >= b.p75) return { label: 'p75', tone: 'success', pct: 80 };
  if (b.p50 != null && value >= b.p50) return { label: 'p50', tone: 'muted', pct: 55 };
  if (b.p25 != null && value >= b.p25) return { label: 'p25', tone: 'warning', pct: 35 };
  return { label: '<p25', tone: 'destructive', pct: 15 };
}

function PercentileBadge({ band }: { band: ReturnType<typeof bandForValue> }) {
  const toneClasses: Record<string, string> = {
    success: 'bg-success/15 text-success border-success/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    destructive: 'bg-destructive/15 text-destructive border-destructive/30',
    muted: 'bg-muted text-muted-foreground border-border',
  };
  const icon = band.tone === 'success' ? <ArrowUp className="h-3 w-3" /> : band.tone === 'destructive' ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${toneClasses[band.tone]}`}>
      {icon} {band.label}
    </span>
  );
}

export function BenchmarkDashboard({
  programId,
  currentStage,
  myHealthScore,
}: BenchmarkDashboardProps) {
  const { t } = useTranslation();
  const { data: benchmarks, isLoading } = useCohortBenchmarks(programId, currentStage);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map(i => <Skeleton key={i} className="h-36" />)}
      </div>
    );
  }

  if (!benchmarks || benchmarks.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t('benchmark.smallCohort', 'Ainda não há dados suficientes no teu grupo para comparação. Os benchmarks são apresentados quando houver pelo menos 5 startups na mesma fase.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const cohortSize = benchmarks[0]?.cohort_size ?? 0;

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full p-2 bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">
                {t('benchmark.title', 'Benchmark anónimo do teu grupo')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('benchmark.percentileDesc', 'Posição percentil entre startups na mesma fase (mínimo 5 para garantir anonimato).')}
              </p>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {cohortSize} {t('benchmark.startups', 'startups')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {benchmarks.map((b) => {
          const myValue = b.metric_key === 'health_score' ? (myHealthScore ?? null) : null;
          const band = myValue != null ? bandForValue(myValue, b) : null;
          return (
            <Card key={b.metric_key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  {b.metric_label || b.metric_key}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t('benchmark.cohortRange', 'p25: {{p25}} · p50: {{p50}} · p75: {{p75}} · p90: {{p90}}', {
                    p25: b.p25?.toFixed(1) ?? '—',
                    p50: b.p50?.toFixed(1) ?? '—',
                    p75: b.p75?.toFixed(1) ?? '—',
                    p90: b.p90?.toFixed(1) ?? '—',
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {myValue != null && band ? (
                  <>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold">{Math.round(myValue)}</p>
                        <p className="text-xs text-muted-foreground">{t('benchmark.you', 'Tu')}</p>
                      </div>
                      <PercentileBadge band={band} />
                    </div>
                    <Progress value={band.pct} className="h-2" />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('benchmark.noPersonalValue', 'Sem valor atual para comparar.')}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
