// Pure scenario math for the Guided Financial Plan.
// Kept separate from the panel component so it can be unit-tested and reused
// by the "save sensitivity as scenario" flow. No side effects, no I/O.

import type { FinancialAssumption } from '@/hooks/useFinancialPlan';

export type ScenarioKey = 'conservative' | 'base' | 'optimistic';

export interface Sensitivity {
  /** Percentage-points added to YoY revenue growth (e.g. -20..+20). */
  revenueGrowth: number;
  /** Percentage-points added to CMVMC ratio. */
  cmvmcDelta: number;
  /** Percentage multiplier applied on top of total payroll (-50..+50). */
  payrollDelta: number;
}

export const DEFAULT_SENSITIVITY: Sensitivity = {
  revenueGrowth: 0,
  cmvmcDelta: 0,
  payrollDelta: 0,
};

/** Per-scenario bias applied on top of user sliders. */
export const SCENARIO_BIAS: Record<ScenarioKey, Sensitivity> = {
  conservative: { revenueGrowth: -10, cmvmcDelta: +5, payrollDelta: +5 },
  base:         { revenueGrowth: 0,   cmvmcDelta: 0,  payrollDelta: 0 },
  optimistic:   { revenueGrowth: +10, cmvmcDelta: -5, payrollDelta: -5 },
};

export interface Kpis {
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

function num(assumptions: FinancialAssumption[], key: string, fallback = 0): number {
  // Defensive: on legacy duplicate rows for the same key, prefer the latest
  // updated_at so a correction always wins over the stale original.
  let picked: FinancialAssumption | undefined;
  for (const x of assumptions) {
    if (x.key !== key) continue;
    if (!picked || (x.updated_at ?? '') > (picked.updated_at ?? '')) picked = x;
  }
  const v = picked?.value_numeric;
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function computeKpis(
  a: FinancialAssumption[],
  s: Sensitivity,
  bias: Sensitivity = SCENARIO_BIAS.base,
): Kpis {
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

/**
 * Map a sensitivity + scenario bias into a concrete list of assumption
 * overrides. This is what "Save as Conservative/Optimistic" persists into
 * `financial_assumptions` for the target scenario.
 *
 * The returned rows are always numeric, and we only emit a row when the
 * derived value differs from the base assumption (avoids polluting the
 * register with no-op copies).
 */
export interface DerivedAssumption {
  key: string;
  value_numeric: number;
  unit: string | null;
  rationale: string;
}

export function sensitivityToDeltas(
  baseAssumptions: FinancialAssumption[],
  slider: Sensitivity,
  target: ScenarioKey,
): DerivedAssumption[] {
  const bias = SCENARIO_BIAS[target];
  const out: DerivedAssumption[] = [];

  const growthBase = num(baseAssumptions, 'revenue.item1.growth');
  const derivedGrowth = growthBase + slider.revenueGrowth + bias.revenueGrowth;
  if (derivedGrowth !== growthBase) {
    out.push({
      key: 'revenue.item1.growth',
      value_numeric: Number(derivedGrowth.toFixed(4)),
      unit: '%',
      rationale: `Derived from base + slider (${slider.revenueGrowth}pp) + ${target} bias (${bias.revenueGrowth}pp)`,
    });
  }

  const cmvmcBase = num(baseAssumptions, 'cost.cmvmc_pct');
  const derivedCmvmc = Math.max(0, cmvmcBase + slider.cmvmcDelta + bias.cmvmcDelta);
  if (derivedCmvmc !== cmvmcBase) {
    out.push({
      key: 'cost.cmvmc_pct',
      value_numeric: Number(derivedCmvmc.toFixed(4)),
      unit: '%',
      rationale: `Derived from base + slider (${slider.cmvmcDelta}pp) + ${target} bias (${bias.cmvmcDelta}pp)`,
    });
  }

  const salaryBase = num(baseAssumptions, 'team.avg_salary_month');
  const mult = 1 + (slider.payrollDelta + bias.payrollDelta) / 100;
  const derivedSalary = salaryBase * mult;
  if (salaryBase > 0 && Math.abs(derivedSalary - salaryBase) > 1e-6) {
    out.push({
      key: 'team.avg_salary_month',
      value_numeric: Number(derivedSalary.toFixed(2)),
      unit: '€',
      rationale: `Derived from base × ${(mult * 100).toFixed(1)}% (slider ${slider.payrollDelta}% + ${target} bias ${bias.payrollDelta}%)`,
    });
  }

  return out;
}
