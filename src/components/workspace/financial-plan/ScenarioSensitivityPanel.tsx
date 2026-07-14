// Scenario sensitivity panel.
// Client-side "what-if" over the assumptions register. Takes
// FinancialAssumption[] and re-computes headline KPIs against three scenario
// columns (Conservative / Base / Optimistic) plus user-driven sensitivity
// sliders. Math lives in ./scenarioMath so it is testable and reusable by the
// "save as scenario" flow.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RotateCcw, TrendingUp, TrendingDown, Minus, Save, Loader2 } from 'lucide-react';
import { notify } from '@/lib/notify';
import type { FinancialAssumption } from '@/hooks/useFinancialPlan';
import {
  computeKpis, sensitivityToDeltas,
  DEFAULT_SENSITIVITY, SCENARIO_BIAS,
  type Sensitivity, type ScenarioKey,
} from './scenarioMath';

interface Props {
  workspaceId: string;
  canWrite: boolean;
  /** Always the BASE-scenario register — the anchor for math. Prevents bias
   *  from compounding when the founder is browsing a non-base scenario. */
  baseAssumptions: FinancialAssumption[];
  /** Parent handles persistence — it copies the full base register into the
   *  target scenario and applies these deltas on top (see useSaveScenarioFromBase). */
  onSaveAsScenario?: (target: ScenarioKey, deltas: ReturnType<typeof sensitivityToDeltas>) => Promise<void> | void;
}

function fmtEUR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function DeltaIcon({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.01) return <Minus className="h-3 w-3 text-muted-foreground" />;
  return delta > 0
    ? <TrendingUp className="h-3 w-3 text-[hsl(var(--success))]" />
    : <TrendingDown className="h-3 w-3 text-destructive" />;
}

export function ScenarioSensitivityPanel({ canWrite, baseAssumptions, onSaveAsScenario }: Props) {
  const { t } = useTranslation();
  const [sens, setSens] = useState<Sensitivity>(DEFAULT_SENSITIVITY);
  const [savingScenario, setSavingScenario] = useState<ScenarioKey | null>(null);

  const scenarios = useMemo(() => {
    return (['conservative', 'base', 'optimistic'] as ScenarioKey[]).map(key => ({
      key,
      kpis: computeKpis(baseAssumptions, sens, SCENARIO_BIAS[key]),
    }));
  }, [baseAssumptions, sens]);

  const base = scenarios.find(s => s.key === 'base')!.kpis;
  const hasAnyRevenue = base.revenueY1 > 0;
  const hasUnitEcon = base.ltv != null;

  const reset = () => setSens(DEFAULT_SENSITIVITY);
  const isDirty = sens.revenueGrowth !== 0 || sens.cmvmcDelta !== 0 || sens.payrollDelta !== 0;

  const handleSaveAsScenario = async (target: ScenarioKey) => {
    const rows = sensitivityToDeltas(baseAssumptions, sens, target);
    if (rows.length === 0 && target !== 'base') {
      // Even with zero slider movement the scenario bias produces deltas; the
      // only way to reach this branch is target='base' with no sliders. Warn.
      notify.info(t('financialPlan.sensitivity.noDeltas', {
        defaultValue: 'No changes to save — sliders match the base.',
      }));
      return;
    }
    setSavingScenario(target);
    try {
      await onSaveAsScenario?.(target, rows);
      setSens(DEFAULT_SENSITIVITY);
    } finally {
      setSavingScenario(null);
    }
  };



  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">
              {t('financialPlan.sensitivity.title', { defaultValue: 'Scenarios & sensitivity' })}
            </CardTitle>
            <CardDescription className="text-xs">
              {t('financialPlan.sensitivity.desc', {
                defaultValue: 'Live projection from your assumptions. Move the sliders to stress-test — nothing is saved.',
              })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {isDirty && (
              <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
                <RotateCcw className="h-3 w-3 mr-1" />
                {t('common.reset', { defaultValue: 'Reset' })}
              </Button>
            )}
            {canWrite && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs"
                    disabled={!hasAnyRevenue || savingScenario !== null}
                  >
                    {savingScenario
                      ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      : <Save className="h-3 w-3 mr-1" />}
                    {t('financialPlan.sensitivity.saveAs', { defaultValue: 'Save as…' })}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleSaveAsScenario('conservative')}>
                    {t('financialPlan.scenario.conservative', { defaultValue: 'Conservative' })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSaveAsScenario('base')}>
                    {t('financialPlan.scenario.base', { defaultValue: 'Base' })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSaveAsScenario('optimistic')}>
                    {t('financialPlan.scenario.optimistic', { defaultValue: 'Optimistic' })}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sliders */}
        <div className="grid gap-4 sm:grid-cols-3">
          <SliderRow
            label={t('financialPlan.sensitivity.revenueGrowth', { defaultValue: 'Revenue growth Δ' })}
            unit="pp"
            value={sens.revenueGrowth}
            onChange={(v) => setSens(s => ({ ...s, revenueGrowth: v }))}
            min={-30} max={30} step={1}
          />
          <SliderRow
            label={t('financialPlan.sensitivity.cmvmc', { defaultValue: 'CMVMC ratio Δ' })}
            unit="pp"
            value={sens.cmvmcDelta}
            onChange={(v) => setSens(s => ({ ...s, cmvmcDelta: v }))}
            min={-20} max={20} step={1}
          />
          <SliderRow
            label={t('financialPlan.sensitivity.payroll', { defaultValue: 'Payroll Δ' })}
            unit="%"
            value={sens.payrollDelta}
            onChange={(v) => setSens(s => ({ ...s, payrollDelta: v }))}
            min={-30} max={30} step={1}
          />
        </div>

        {!hasAnyRevenue && (
          <p className="text-xs text-muted-foreground">
            {t('financialPlan.sensitivity.empty', {
              defaultValue: 'Fill in revenue and cost assumptions to see the projection.',
            })}
          </p>
        )}

        {hasAnyRevenue && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 font-medium">{t('financialPlan.sensitivity.metric', { defaultValue: 'Metric' })}</th>
                  {scenarios.map(s => (
                    <th key={s.key} className="text-right py-1.5 font-medium">
                      <Badge
                        variant={s.key === 'base' ? 'default' : 'outline'}
                        className="text-[10px] uppercase tracking-wide"
                      >
                        {t(`financialPlan.scenario.${s.key}`, { defaultValue: s.key })}
                      </Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                <KpiRow label={t('financialPlan.kpi.revenueY1', { defaultValue: 'Revenue Y1' })}
                        values={scenarios.map(s => fmtEUR(s.kpis.revenueY1))}
                        deltas={scenarios.map(s => s.kpis.revenueY1 - base.revenueY1)} />
                <KpiRow label={t('financialPlan.kpi.revenueY2', { defaultValue: 'Revenue Y2' })}
                        values={scenarios.map(s => fmtEUR(s.kpis.revenueY2))}
                        deltas={scenarios.map(s => s.kpis.revenueY2 - base.revenueY2)} />
                <KpiRow label={t('financialPlan.kpi.cogs', { defaultValue: 'COGS' })}
                        values={scenarios.map(s => fmtEUR(s.kpis.cogs))}
                        deltas={scenarios.map(s => -(s.kpis.cogs - base.cogs))} />
                <KpiRow label={t('financialPlan.kpi.grossMargin', { defaultValue: 'Gross margin' })}
                        values={scenarios.map(s => fmtPct(s.kpis.grossMarginPct))}
                        deltas={scenarios.map(s => s.kpis.grossMarginPct - base.grossMarginPct)} />
                <KpiRow label={t('financialPlan.kpi.payroll', { defaultValue: 'Payroll (14m)' })}
                        values={scenarios.map(s => fmtEUR(s.kpis.payrollYear))}
                        deltas={scenarios.map(s => -(s.kpis.payrollYear - base.payrollYear))} />
                <KpiRow label={t('financialPlan.kpi.ebitdaProxy', { defaultValue: 'EBITDA proxy' })}
                        values={scenarios.map(s => fmtEUR(s.kpis.ebitdaProxy))}
                        deltas={scenarios.map(s => s.kpis.ebitdaProxy - base.ebitdaProxy)}
                        emphasize />
                {hasUnitEcon && (
                  <>
                    <KpiRow label={t('financialPlan.kpi.ltvCac', { defaultValue: 'LTV : CAC' })}
                            values={scenarios.map(s => s.kpis.ltvCac != null ? `${fmtNum(s.kpis.ltvCac)}×` : '—')}
                            deltas={scenarios.map(s => (s.kpis.ltvCac ?? 0) - (base.ltvCac ?? 0))} />
                    <KpiRow label={t('financialPlan.kpi.payback', { defaultValue: 'Payback (months)' })}
                            values={scenarios.map(s => s.kpis.paybackMonths != null ? fmtNum(s.kpis.paybackMonths, 1) : '—')}
                            deltas={scenarios.map(s => -((s.kpis.paybackMonths ?? 0) - (base.paybackMonths ?? 0)))} />
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {t('financialPlan.sensitivity.footnote', {
            defaultValue: 'Illustrative — computed live from your assumptions register. Not a substitute for the canonical XLSM model.',
          })}
        </p>
      </CardContent>
    </Card>
  );
}

function SliderRow({
  label, unit, value, onChange, min, max, step,
}: {
  label: string; unit: string; value: number;
  onChange: (v: number) => void; min: number; max: number; step: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value > 0 ? '+' : ''}{value}{unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

function KpiRow({
  label, values, deltas, emphasize,
}: {
  label: string; values: string[]; deltas: number[]; emphasize?: boolean;
}) {
  return (
    <tr>
      <td className={`py-1.5 ${emphasize ? 'font-medium' : ''}`}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`py-1.5 text-right tabular-nums ${emphasize ? 'font-semibold' : ''}`}>
          <span className="inline-flex items-center gap-1 justify-end">
            {i !== 1 /* not base column */ && <DeltaIcon delta={deltas[i]} />}
            {v}
          </span>
        </td>
      ))}
    </tr>
  );
}
