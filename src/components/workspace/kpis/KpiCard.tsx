import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Minus, Lock, Unlock, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { BrandChevron } from '@/components/ui/BrandChevron';
import type { WorkspaceKpi, KpiValue } from '@/hooks/useKpis';

interface KpiCardProps {
  workspaceKpi: WorkspaceKpi;
  currentValue: KpiValue | undefined;
  editedValue: { value: string; notes: string } | undefined;
  chartData: { month: string; value: number | null; label: string }[];
  canEdit: boolean;
  isSaving: boolean;
  isSaved: boolean;
  /** Optional p75 benchmark for this KPI. When crossed (prev<p75, curr>=p75), fires a one-shot breakout indicator. */
  p75?: number | null;
  onValueChange: (field: 'value' | 'notes', val: string) => void;
  onSave: () => void;
  onBlurFlush?: () => void;
  onUnlock?: (kpiValueId: string) => void;
}


export function KpiCard({
  workspaceKpi,
  currentValue,
  editedValue,
  chartData,
  canEdit,
  isSaving,
  isSaved,
  p75,
  onValueChange,
  onSave,
  onBlurFlush,
  onUnlock,
}: KpiCardProps) {
  const { t } = useTranslation();
  const def = workspaceKpi.definition;

  const recentValues = chartData.filter(d => d.value !== null).slice(-2);

  // P75 breakout hook must run on every render (even when `def` is missing) so
  // the hook order stays stable across re-renders. Guard the effect body on
  // `def` and other inputs.
  const breakout = useMemo(() => {
    if (!def || p75 == null) return false;
    if (recentValues.length < 2) return false;
    const [prev, curr] = recentValues;
    if (prev.value == null || curr.value == null) return false;
    const crossed = def.direction === 'up'
      ? prev.value < p75 && curr.value >= p75
      : prev.value > p75 && curr.value <= p75;
    if (!crossed) return false;
    if (typeof window === 'undefined') return true;
    const key = `kpi_p75_celebrated_${workspaceKpi.id}_${curr.month}`;
    if (window.localStorage.getItem(key)) return false;
    window.localStorage.setItem(key, '1');
    return true;
  }, [p75, recentValues, def, workspaceKpi.id]);

  if (!def) return null;

  const displayValue = editedValue?.value ?? currentValue?.value?.toString() ?? '';
  const displayNotes = editedValue?.notes ?? currentValue?.notes ?? '';

  const isLocked = currentValue?.locked_by_source ?? false;
  const sourceType = currentValue?.source_type ?? 'manual';
  const isFromFinancialModel = sourceType === 'financial_model';
  const effectiveCanEdit = canEdit && !isLocked;

  const hasChanges = editedValue !== undefined;

  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (recentValues.length >= 2) {
    const [prev, curr] = recentValues;
    if (curr.value! > prev.value!) trend = 'up';
    else if (curr.value! < prev.value!) trend = 'down';
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = def.direction === 'up'
    ? (trend === 'up' ? 'text-[hsl(var(--success))]' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground')
    : (trend === 'down' ? 'text-[hsl(var(--success))]' : trend === 'up' ? 'text-destructive' : 'text-muted-foreground');

  const chartDataFiltered = chartData.map(d => ({ ...d, value: d.value }));

  return (
    <Card className={cn(
      "transition-colors duration-300 relative",
      isLocked && 'border-[hsl(var(--warning))]/30',
      isSaved && 'border-[hsl(var(--success))]/30',
      breakout && 'breakout-glow border-primary/50',
    )}>

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              {def.name}
              {workspaceKpi.required && (
                <Badge variant="outline" className="text-xs">{t('kpis.required', 'Required')}</Badge>
              )}
              {isLocked && <Lock className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />}
            </CardTitle>
            {def.description && <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>}
            {isFromFinancialModel && currentValue && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]">
                  {t('financialPanel.fromFinancialModel', { defaultValue: 'From Financial Model' })}
                </Badge>
                {isLocked && canEdit && onUnlock && (
                  <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs" onClick={() => onUnlock(currentValue.id)}>
                    <Unlock className="h-3 w-3 mr-1" />
                    {t('kpis.unlock', 'Unlock')}
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isSaving && <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
            {isSaved && !isSaving && <Check className="h-4 w-4 text-[hsl(var(--success))] animate-in fade-in duration-200" />}
            <TrendIcon className={`h-4 w-4 ${trendColor}`} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            {effectiveCanEdit ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('kpis.value', 'Value')}</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={displayValue} onChange={e => onValueChange('value', e.target.value)} onBlur={() => onBlurFlush?.()} placeholder={t('kpis.enterValue', 'Enter value')} className="h-9" />
                  {def.unit && <span className="text-sm text-muted-foreground shrink-0">{def.unit}</span>}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {currentValue?.value !== null && currentValue?.value !== undefined ? currentValue.value.toLocaleString() : '—'}
                </span>
                {def.unit && <span className="text-sm text-muted-foreground">{def.unit}</span>}
                {breakout && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-strong animate-bounce-in"
                    title={t('kpis.p75Breakout', { defaultValue: 'Above top-quartile benchmark' })}
                  >
                    <BrandChevron size={10} color="lime" strokeWidth={4} className="-rotate-90" />
                    p75
                  </span>
                )}
              </div>
            )}

          </div>
          {workspaceKpi.target_value !== null && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">{t('kpis.target')}</div>
              <div className="text-sm font-medium">
                {workspaceKpi.target_value.toLocaleString()}
                {def.unit && <span className="text-muted-foreground ml-0.5">{def.unit}</span>}
              </div>
            </div>
          )}
        </div>

        {effectiveCanEdit ? (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('kpis.notesOptional', 'Notes (optional)')}</Label>
            <Textarea value={displayNotes} onChange={e => onValueChange('notes', e.target.value)} onBlur={() => onBlurFlush?.()} placeholder={t('kpis.addContext', 'Add context...')} rows={2} className="text-sm" />
          </div>
        ) : currentValue?.notes ? (
          <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{currentValue.notes}</div>
        ) : null}

        {isLocked && canEdit && (
          <div className="text-xs text-[hsl(var(--warning))] flex items-center gap-1">
            <Lock className="h-3 w-3" />
            {t('financialPanel.lockedFromSync', { defaultValue: 'Locked from Financial Model sync. Unlock to edit manually.' })}
          </div>
        )}

        {effectiveCanEdit && hasChanges && !isSaving && !isSaved && (
          <p className="text-[11px] text-muted-foreground text-center animate-in fade-in">
            {t('kpis.savingShortly', 'A guardar automaticamente...')}
          </p>
        )}

        <div className="h-24 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataFiltered}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ fontSize: 12, backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
                formatter={(value: number) => [
                  value !== null ? `${value.toLocaleString()}${def.unit ? ` ${def.unit}` : ''}` : t('common.noData', 'Sem dados'),
                  def.name
                ]}
              />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
