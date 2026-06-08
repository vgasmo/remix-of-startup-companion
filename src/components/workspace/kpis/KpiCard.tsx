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
  onValueChange,
  onSave,
  onUnlock,
}: KpiCardProps) {
  const { t } = useTranslation();
  const def = workspaceKpi.definition;
  if (!def) return null;

  const displayValue = editedValue?.value ?? currentValue?.value?.toString() ?? '';
  const displayNotes = editedValue?.notes ?? currentValue?.notes ?? '';
  
  const isLocked = currentValue?.locked_by_source ?? false;
  const sourceType = currentValue?.source_type ?? 'manual';
  const isFromFinancialModel = sourceType === 'financial_model';
  const effectiveCanEdit = canEdit && !isLocked;
  
  const hasChanges = editedValue !== undefined;

  const recentValues = chartData.filter(d => d.value !== null).slice(-2);
  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (recentValues.length >= 2) {
    const [prev, curr] = recentValues;
    if (curr.value! > prev.value!) trend = 'up';
    else if (curr.value! < prev.value!) trend = 'down';
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = def.direction === 'up' 
    ? (trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground')
    : (trend === 'down' ? 'text-green-600' : trend === 'up' ? 'text-destructive' : 'text-muted-foreground');

  const chartDataFiltered = chartData.map(d => ({ ...d, value: d.value }));

  return (
    <Card className={cn(
      "transition-colors duration-300",
      isLocked && 'border-amber-200 dark:border-amber-800',
      isSaved && 'border-green-300 dark:border-green-800',
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              {def.name}
              {workspaceKpi.required && (
                <Badge variant="outline" className="text-xs">{t('kpis.required', 'Required')}</Badge>
              )}
              {isLocked && <Lock className="h-3.5 w-3.5 text-amber-600" />}
            </CardTitle>
            {def.description && <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>}
            {isFromFinancialModel && currentValue && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
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
            {isSaved && !isSaving && <Check className="h-4 w-4 text-green-600 animate-in fade-in duration-200" />}
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
                  <Input type="number" value={displayValue} onChange={e => onValueChange('value', e.target.value)} placeholder={t('kpis.enterValue', 'Enter value')} className="h-9" />
                  {def.unit && <span className="text-sm text-muted-foreground shrink-0">{def.unit}</span>}
                </div>
              </div>
            ) : (
              <div>
                <span className="text-2xl font-bold">
                  {currentValue?.value !== null && currentValue?.value !== undefined ? currentValue.value.toLocaleString() : '—'}
                </span>
                {def.unit && <span className="text-sm text-muted-foreground ml-1">{def.unit}</span>}
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
            <Textarea value={displayNotes} onChange={e => onValueChange('notes', e.target.value)} placeholder={t('kpis.addContext', 'Add context...')} rows={2} className="text-sm" />
          </div>
        ) : currentValue?.notes ? (
          <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{currentValue.notes}</div>
        ) : null}

        {isLocked && canEdit && (
          <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
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
