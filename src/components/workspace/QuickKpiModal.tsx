import { useState, useMemo, useCallback } from 'react';
import { triggerKpiCelebration } from '@/lib/confetti';
import { useTranslation } from 'react-i18next';
import { format, startOfMonth, subMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import { TrendingUp, ChevronLeft, ChevronRight, Check, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useWorkspaceKpiDefinitions, useKpiValues, useUpsertKpiValue } from '@/hooks/useKpis';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface QuickKpiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  programId: string;
}

export function QuickKpiModal({ open, onOpenChange, workspaceId, programId }: QuickKpiModalProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data: workspaceKpis } = useWorkspaceKpiDefinitions(workspaceId);
  const { data: kpiValues } = useKpiValues(workspaceId);
  const upsertKpi = useUpsertKpiValue(workspaceId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const previousMonth = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
  const monthLabel = format(new Date(), 'MMMM yyyy', { locale: i18n.language === 'pt' ? pt : undefined });

  // KPIs missing values this month
  const kpisToShow = useMemo(() => {
    if (!workspaceKpis) return [];
    const currentMonthValues = kpiValues?.filter(v => v.period_month === currentMonth) || [];
    const filledKpiIds = new Set(currentMonthValues.map(v => v.kpi_definition_id));
    return workspaceKpis
      .filter(wk => wk.definition && !filledKpiIds.has(wk.kpi_definition_id))
      .map(wk => ({
        ...wk,
        definition: wk.definition!,
        previousValue: kpiValues?.find(
          v => v.kpi_definition_id === wk.kpi_definition_id && v.period_month === previousMonth
        )?.value ?? null,
      }));
  }, [workspaceKpis, kpiValues, currentMonth, previousMonth]);

  const currentKpi = kpisToShow[currentIndex];
  const filledCount = Object.values(values).filter(v => v.trim() !== '').length;
  const totalCount = kpisToShow.length;
  const progress = totalCount > 0 ? (filledCount / totalCount) * 100 : 100;

  const handleNext = useCallback(() => {
    if (currentIndex < kpisToShow.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, kpisToShow.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const handleSubmit = async () => {
    const entriesToSubmit = Object.entries(values).filter(([, v]) => v.trim() !== '');

    if (entriesToSubmit.length === 0) {
      notify.error(t('quickKpi.enterAtLeastOne', { defaultValue: 'Introduza pelo menos um valor' }));
      return;
    }

    setSubmitting(true);

    // Optimistic update
    const previousKpiValues = queryClient.getQueryData(['kpi-values', workspaceId, 12]);

    queryClient.setQueryData(['kpi-values', workspaceId, 12], (old: any[] | undefined) => {
      const existing = old || [];
      const newEntries = entriesToSubmit.map(([kpiDefId, value]) => ({
        id: `temp-${kpiDefId}`,
        workspace_id: workspaceId,
        kpi_definition_id: kpiDefId,
        period_month: currentMonth,
        value: parseFloat(value),
        target_value: null,
        notes: null,
        created_at: new Date().toISOString(),
        source_type: 'manual',
        source_ref_id: null,
        locked_by_source: false,
      }));
      return [...existing, ...newEntries];
    });

    const submitPromise = (async () => {
      for (const [kpiDefId, value] of entriesToSubmit) {
        await upsertKpi.mutateAsync({
          kpi_definition_id: kpiDefId,
          period_month: currentMonth,
          value: parseFloat(value),
        });
      }
    })();

    notify.promise(submitPromise, {
      loading: t('quickKpi.saving', { defaultValue: 'A guardar KPIs...' }),
      success: () => {
        setValues({});
        setCurrentIndex(0);
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ['kpi-values', workspaceId] });
        triggerKpiCelebration();
        return t('kpis.savedSuccess', { defaultValue: 'KPIs atualizados! Continue assim 💪' });
      },
      error: () => {
        // Rollback
        queryClient.setQueryData(['kpi-values', workspaceId, 12], previousKpiValues);
        return t('quickKpi.error', { defaultValue: 'Falha ao guardar KPIs' });
      },
    });

    try {
      await submitPromise;
    } catch {
      // handled by toast.promise
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentIndex < kpisToShow.length - 1) {
        handleNext();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden border-0 shadow-2xl rounded-2xl">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t('quickKpi.title', { defaultValue: 'Entrada Rápida de KPI' })}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('quickKpi.description', { defaultValue: 'Atualize as suas métricas chave para {{month}}', month: monthLabel })}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{filledCount}/{totalCount} {t('quickKpi.filled', { defaultValue: 'preenchidos' })}</span>
              {progress === 100 && totalCount > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-primary/10 text-primary">
                  <Check className="h-3 w-3" />
                  {t('quickKpi.complete', { defaultValue: 'Completo' })}
                </Badge>
              )}
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        </div>

        {/* Card Stack */}
        <div className="px-6 py-5 min-h-[200px] flex flex-col items-center justify-center">
          {kpisToShow.length === 0 ? (
            <div className="text-center py-6">
              <div className="h-14 w-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {t('quickKpi.allFilled', { defaultValue: 'Todos os KPIs estão atualizados!' })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('quickKpi.allFilledDesc', { defaultValue: 'Volte no próximo mês.' })}
              </p>
            </div>
          ) : currentKpi ? (
            <div className="w-full space-y-4">
              {/* KPI Card */}
              <div
                className={cn(
                  'rounded-xl border border-border/60 bg-card p-5 shadow-sm',
                  'transition-all duration-300 ease-out',
                )}
              >
                {/* KPI name & unit */}
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-foreground">{currentKpi.definition.name}</h3>
                  {currentKpi.definition.unit && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {currentKpi.definition.unit}
                    </Badge>
                  )}
                </div>

                {currentKpi.definition.description && (
                  <p className="text-xs text-muted-foreground mb-4">{currentKpi.definition.description}</p>
                )}

                {/* Previous value reference */}
                {currentKpi.previousValue !== null && (
                  <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-muted/50 border border-border/40">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      {t('quickKpi.previousMonth', { defaultValue: 'Mês anterior:' })}
                    </span>
                    <span className="text-xs font-semibold text-foreground ml-auto">
                      {currentKpi.previousValue.toLocaleString()}
                      {currentKpi.definition.unit ? ` ${currentKpi.definition.unit}` : ''}
                    </span>
                  </div>
                )}

                {/* Input */}
                <Input
                  type="number"
                  inputMode="decimal"
                  autoFocus
                  placeholder={t('quickKpi.enterValue', { defaultValue: 'Introduza o valor...' })}
                  value={values[currentKpi.definition.id] || ''}
                  onChange={(e) => setValues(prev => ({ ...prev, [currentKpi.definition.id]: e.target.value }))}
                  onKeyDown={handleKeyDown}
                  className="h-12 text-lg font-semibold text-center rounded-xl border-primary/20 focus:border-primary/40"
                />
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('common.previous', { defaultValue: 'Anterior' })}
                </Button>

                <span className="text-xs text-muted-foreground font-medium">
                  {currentIndex + 1} / {kpisToShow.length}
                </span>

                {currentIndex < kpisToShow.length - 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNext}
                    className="gap-1"
                  >
                    {t('common.next', { defaultValue: 'Seguinte' })}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="w-20" /> // spacer
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel', { defaultValue: 'Cancelar' })}
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={handleSubmit}
            disabled={submitting || filledCount === 0}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {t('quickKpi.save', { defaultValue: 'Guardar KPIs' })} ({filledCount})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
