import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, TrendingUp, Target, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PIPELINE_STAGES } from '@/hooks/useCrmPipeline';
import type { CrmInboxItem } from '@/hooks/useCrmInbox';
import { cn } from '@/lib/utils';
import { getFunnelStageLabel } from '@/lib/stageLabels';

const DEFAULT_WIN_PROBABILITY: Record<string, number> = {
  new: 5, first_contact_booked: 10, met: 20, qualified: 40,
  proposal_sent: 60, negotiating: 75, contracted: 95,
};

interface PipelineForecastCardProps {
  pipeline: Record<string, CrmInboxItem[]> | undefined;
}

export function PipelineForecastCard({ pipeline }: PipelineForecastCardProps) {
  const { t, i18n } = useTranslation();

  const forecast = useMemo(() => {
    if (!pipeline) return null;

    let totalValue = 0;
    let weightedValue = 0;
    let dealsWithValue = 0;
    let totalDeals = 0;
    const byStage: { stage: string; value: number; weighted: number; count: number }[] = [];

    for (const stage of PIPELINE_STAGES) {
      const items = pipeline[stage] || [];
      let stageValue = 0;
      let stageWeighted = 0;
      let stageCount = 0;

      for (const item of items) {
        totalDeals++;
        const dv = (item as any).deal_value;
        if (dv && dv > 0) {
          dealsWithValue++;
          const prob = (item as any).win_probability ?? DEFAULT_WIN_PROBABILITY[stage] ?? 0;
          stageValue += dv;
          stageWeighted += dv * (prob / 100);
          stageCount++;
        }
      }

      totalValue += stageValue;
      weightedValue += stageWeighted;

      if (stageCount > 0) {
        byStage.push({ stage, value: stageValue, weighted: stageWeighted, count: stageCount });
      }
    }

    return { totalValue, weightedValue, dealsWithValue, totalDeals, byStage };
  }, [pipeline]);

  if (!forecast || forecast.dealsWithValue === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <DollarSign className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {t('crm.forecast.noData', { defaultValue: 'Adicione valores aos deals para ver o forecast' })}
          </p>
        </CardContent>
      </Card>
    );
  }

  const fmt = (v: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          {t('crm.forecast.title', { defaultValue: 'Pipeline Forecast' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{fmt(forecast.totalValue)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('crm.forecast.totalPipeline', { defaultValue: 'Total Pipeline' })}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{fmt(forecast.weightedValue)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('crm.forecast.weighted', { defaultValue: 'Ponderado' })}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{forecast.dealsWithValue}/{forecast.totalDeals}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('crm.forecast.deals', { defaultValue: 'Deals c/ valor' })}</p>
          </div>
        </div>

        {/* Breakdown by stage */}
        <div className="space-y-2">
          {forecast.byStage.map(({ stage, value, weighted, count }) => (
            <div key={stage} className="flex items-center gap-3">
              <div className="w-28 text-xs font-medium truncate">{getFunnelStageLabel(t, stage as any)}</div>
              <div className="flex-1">
                <Progress value={forecast.totalValue > 0 ? (value / forecast.totalValue) * 100 : 0} className="h-2" />
              </div>
              <div className="text-xs text-right w-24 text-muted-foreground">
                {fmt(weighted)} <span className="text-[10px]">({count})</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
