// Scenario sensitivity panel.
// Client-side "what-if" over the assumptions register. Pure presentation:
// takes FinancialAssumption[] and re-computes headline KPIs against three
// scenario columns (Conservative / Base / Optimistic) plus user-driven
// sensitivity sliders. Nothing is persisted here — this is a projection layer.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCcw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { FinancialAssumption } from '@/hooks/useFinancialPlan';

interface Props {
  assumptions: FinancialAssumption[];
}

type ScenarioKey = 'conservative' | 'base' | 'optimistic';

interface Sensitivity {
  revenueGrowth: number;   // percentage-points added to YoY growth (e.g. -20..+20)
  cmvmcDelta: number;      // percentage-points added to CMVMC ratio
  payrollDelta: number;    // percentage multiplier on total payroll (-50..+50)
}

const DEFAULT_SENSITIVITY: Sensitivity = { revenueGrowth: 0, cmvmcDelta: 0, payrollDelta: 0 };

// Per-scenario multipliers applied on top of user sliders. Conservative
// dampens revenue, inflates costs; optimistic does the opposite.
const SCENARIO_BIAS: Record<ScenarioKey, Sensitivity> = {
  conservative: { revenueGrowth: -10, cmvmcDelta: +5, payrollDelta: +5 },
  base:         { revenueGrowth: 0,   cmvmcDelta: 0,  payrollDelta: 0 },
  optimistic:   { revenueGrowth: +10, cmvmcDelta: -5, payrollDelta: -5 },
};

function num(assumptions: FinancialAssumption[], key: string, fallback = 0): number {
  const a = assumptions.find(x => x.key === key);
  const v = a?.value_numeric;
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
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

interface Kpis {
  revenueY1: number;
  revenueY2: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  payrollYear: number;
  ebitdaProxy: number;
  ltv: number | null;
  cac: number | null;
  ltvCac: number | null;
  paybackMonths: number | null;
}

function computeKpis(a: FinancialAssumption[], s: Sensitivity, bias: Sensitivity): Kpis {
  const qty = num(a, 'revenue.item1.qty_y1');
  const price = num(a, 'revenue.item1.price');
  const growthPct = num(a, 'revenue.item1.growth') + s.revenueGrowth + bias.revenueGrowth;
  const cmvmcPct = Math.max(0, num(a, 'cost.cmvmc_pct') + s.cmvmcDelta + bias.cmvmcDelta);
  const headcount = num(a, 'team.headcount_y1');
  const avgSalary = num(a, 'team.avg_salary_month');
  const payrollMult = 1 + (s.payrollDelta + bias.payrollDelta) / 100;

  const revenueY1 = qty * price;
  const revenueY2 = revenueY1 * (1 + growthPct / 100);
  const cogs = revenueY1 * (cmvmcPct / 100);
  const grossProfit = revenueY1 - cogs;
  const grossMarginPct = revenueY1 > 0 ? (grossProfit / revenueY1) * 100 : 0;
  // 14 months in PT payroll (12 + holiday + Xmas subsidies) as a rough proxy.
  const payrollYear = headcount * avgSalary * 14 * payrollMult;
  const ebitdaProxy = grossProfit - payrollYear;

  // Unit economics — only if the founder supplied them.
  const cacRaw = a.find(x => x.key === 'ue.cac')?.value_numeric ?? null;
  const arpu = a.find(x => x.key === 'ue.arpu_month')?.value_numeric ?? null;
  const gmPct = a.find(x => x.key === 'ue.gross_margin_pct')?.value_numeric ?? null;
  const churnPct = a.find(x => x.key === 'ue.churn_monthly_pct')?.value_numeric ?? null;

  let ltv: number | null = null;
  let ltvCac: number | null = null;
  let paybackMonths: number | null = null;
  if (arpu != null && gmPct != null && churnPct != null && churnPct > 0) {
    const lifetimeMonths = 1 / (churnPct / 100);
    ltv = arpu * lifetimeMonths * (gmPct / 100);
    if (cacRaw != null && cacRaw > 0) {
      ltvCac = ltv / cacRaw;
      const monthlyContribution = arpu * (gmPct / 100);
      paybackMonths = monthlyContribution > 0 ? cacRaw / monthlyContribution : null;
    }
  }

  return {
    revenueY1, revenueY2, cogs, grossProfit, grossMarginPct,
    payrollYear, ebitdaProxy,
    ltv, cac: cacRaw, ltvCac, paybackMonths,
  };
}

function DeltaIcon({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.01) return <Minus className="h-3 w-3 text-muted-foreground" />;
  return delta > 0
    ? <TrendingUp className="h-3 w-3 text-[hsl(var(--success))]" />
    : <TrendingDown className="h-3 w-3 text-destructive" />;
}

export function ScenarioSensitivityPanel({ assumptions }: Props) {
  const { t } = useTranslation();
  const [sens, setSens] = useState<Sensitivity>(DEFAULT_SENSITIVITY);

  const scenarios = useMemo(() => {
    return (['conservative', 'base', 'optimistic'] as ScenarioKey[]).map(key => ({
      key,
      kpis: computeKpis(assumptions, sens, SCENARIO_BIAS[key]),
    }));
  }, [assumptions, sens]);

  const base = scenarios.find(s => s.key === 'base')!.kpis;
  const hasAnyRevenue = base.revenueY1 > 0;
  const hasUnitEcon = base.ltv != null;

  const reset = () => setSens(DEFAULT_SENSITIVITY);
  const isDirty = sens.revenueGrowth !== 0 || sens.cmvmcDelta !== 0 || sens.payrollDelta !== 0;

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
          {isDirty && (
            <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              {t('common.reset', { defaultValue: 'Reset' })}
            </Button>
          )}
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
