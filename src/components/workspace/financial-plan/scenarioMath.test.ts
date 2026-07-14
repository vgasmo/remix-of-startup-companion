// Pure math tests for the scenario sensitivity engine.
// No React, no Supabase — just the projection logic that drives the
// Conservative / Base / Optimistic columns and the "save as scenario" flow.

import { describe, it, expect } from 'vitest';
import {
  computeKpis, sensitivityToDeltas, SCENARIO_BIAS, DEFAULT_SENSITIVITY,
} from './scenarioMath';
import type { FinancialAssumption } from '@/hooks/useFinancialPlan';

// Minimal factory — only the fields computeKpis reads.
function a(key: string, value: number, unit: string | null = null): FinancialAssumption {
  return {
    id: `id-${key}`,
    workspace_id: 'w',
    version_id: null,
    scenario: 'base',
    key,
    period_index: null,
    value_numeric: value,
    value_json: null,
    unit,
    source: 'founder',
    confidence: null,
    rationale: null,
    owner_user_id: null,
    last_validated_at: null,
    created_at: '',
    updated_at: '',
  };
}

const REVENUE_ASSUMPTIONS: FinancialAssumption[] = [
  a('revenue.item1.qty_y1', 100),
  a('revenue.item1.price', 50, '€'),
  a('revenue.item1.growth', 20, '%'),
  a('cost.cmvmc_pct', 40, '%'),
  a('team.headcount_y1', 2),
  a('team.avg_salary_month', 1500, '€'),
];

const UE_ASSUMPTIONS: FinancialAssumption[] = [
  a('ue.cac', 100, '€'),
  a('ue.arpu_month', 50, '€'),
  a('ue.gross_margin_pct', 80, '%'),
  a('ue.churn_monthly_pct', 5, '%'),
];

describe('computeKpis — base scenario, no sensitivity', () => {
  const kpis = computeKpis(REVENUE_ASSUMPTIONS, DEFAULT_SENSITIVITY, SCENARIO_BIAS.base);

  it('multiplies qty × price for revenue Y1', () => {
    expect(kpis.revenueY1).toBe(5000);
  });

  it('applies growth for revenue Y2 (20% → 6000)', () => {
    expect(kpis.revenueY2).toBeCloseTo(6000, 6);
  });

  it('computes COGS = revenue × cmvmc% (40% → 2000)', () => {
    expect(kpis.cogs).toBe(2000);
    expect(kpis.grossProfit).toBe(3000);
    expect(kpis.grossMarginPct).toBeCloseTo(60, 6);
  });

  it('uses the PT 14-month payroll multiplier grossed up by TSU (23.75%)', () => {
    // 2 heads × 1500 × 14 × 1.2375 = 51_975
    expect(kpis.payrollYear).toBeCloseTo(51_975, 4);
  });

  it('returns null unit economics when the assumptions are missing', () => {
    expect(kpis.ltv).toBeNull();
    expect(kpis.ltvCac).toBeNull();
    expect(kpis.paybackMonths).toBeNull();
  });
});

describe('computeKpis — scenario bias shifts revenue & costs', () => {
  it('conservative dampens growth and inflates CMVMC', () => {
    const base = computeKpis(REVENUE_ASSUMPTIONS, DEFAULT_SENSITIVITY, SCENARIO_BIAS.base);
    const conservative = computeKpis(REVENUE_ASSUMPTIONS, DEFAULT_SENSITIVITY, SCENARIO_BIAS.conservative);

    // Growth 20 - 10 = 10 → revenueY2 = 5000 * 1.10 = 5500
    expect(conservative.revenueY2).toBeCloseTo(5500, 6);
    expect(conservative.revenueY2).toBeLessThan(base.revenueY2);

    // CMVMC 40 + 5 = 45 → cogs = 2250
    expect(conservative.cogs).toBeCloseTo(2250, 6);
    expect(conservative.cogs).toBeGreaterThan(base.cogs);
    expect(conservative.grossMarginPct).toBeLessThan(base.grossMarginPct);
  });

  it('optimistic boosts growth and cuts CMVMC & payroll', () => {
    const base = computeKpis(REVENUE_ASSUMPTIONS, DEFAULT_SENSITIVITY, SCENARIO_BIAS.base);
    const optimistic = computeKpis(REVENUE_ASSUMPTIONS, DEFAULT_SENSITIVITY, SCENARIO_BIAS.optimistic);

    expect(optimistic.revenueY2).toBeGreaterThan(base.revenueY2);
    expect(optimistic.cogs).toBeLessThan(base.cogs);
    // Payroll bias -5% → 51_975 * 0.95 = 49_376.25
    expect(optimistic.payrollYear).toBeCloseTo(49_376.25, 4);
  });
});


describe('computeKpis — user slider stacks on top of scenario bias', () => {
  it('adds slider revenueGrowth pp to the growth rate before bias', () => {
    // 20 (base) + 10 (slider) - 10 (conservative bias) = 20 → revenueY2 = 6000
    const k = computeKpis(
      REVENUE_ASSUMPTIONS,
      { ...DEFAULT_SENSITIVITY, revenueGrowth: 10 },
      SCENARIO_BIAS.conservative,
    );
    expect(k.revenueY2).toBeCloseTo(6000, 6);
  });

  it('clamps a negative effective CMVMC ratio at zero', () => {
    const k = computeKpis(
      REVENUE_ASSUMPTIONS,
      { ...DEFAULT_SENSITIVITY, cmvmcDelta: -100 }, // would drive well below 0
      SCENARIO_BIAS.base,
    );
    expect(k.cogs).toBe(0);
    expect(k.grossMarginPct).toBeCloseTo(100, 6);
  });
});

describe('computeKpis — unit economics', () => {
  const all = [...REVENUE_ASSUMPTIONS, ...UE_ASSUMPTIONS];
  const kpis = computeKpis(all, DEFAULT_SENSITIVITY, SCENARIO_BIAS.base);

  it('derives LTV from ARPU × lifetime × gross-margin', () => {
    // lifetime = 1 / 0.05 = 20 months; LTV = 50 * 20 * 0.8 = 800
    expect(kpis.ltv).toBeCloseTo(800, 6);
  });

  it('derives LTV:CAC and payback (months)', () => {
    // LTV/CAC = 800 / 100 = 8
    expect(kpis.ltvCac).toBeCloseTo(8, 6);
    // payback = CAC / (ARPU × GM%) = 100 / (50 × 0.8) = 2.5
    expect(kpis.paybackMonths).toBeCloseTo(2.5, 6);
  });

  it('returns null LTV when churn is zero (avoids division blowup)', () => {
    const noChurn = [...REVENUE_ASSUMPTIONS, ...UE_ASSUMPTIONS.map(x =>
      x.key === 'ue.churn_monthly_pct' ? { ...x, value_numeric: 0 } : x,
    )];
    const k = computeKpis(noChurn, DEFAULT_SENSITIVITY, SCENARIO_BIAS.base);
    expect(k.ltv).toBeNull();
  });
});

describe('sensitivityToDeltas — save-as-scenario materialization', () => {
  it('returns [] when sliders and scenario bias both cancel out', () => {
    // base scenario has zero bias, and slider is default (all zero)
    expect(sensitivityToDeltas(REVENUE_ASSUMPTIONS, DEFAULT_SENSITIVITY, 'base')).toEqual([]);
  });

  it('materializes revenue growth, cmvmc and payroll for conservative', () => {
    const rows = sensitivityToDeltas(REVENUE_ASSUMPTIONS, DEFAULT_SENSITIVITY, 'conservative');
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));

    // 20 + 0 - 10 = 10
    expect(byKey['revenue.item1.growth'].value_numeric).toBeCloseTo(10, 6);
    // 40 + 0 + 5 = 45
    expect(byKey['cost.cmvmc_pct'].value_numeric).toBeCloseTo(45, 6);
    // 1500 * (1 + 5/100) = 1575
    expect(byKey['team.avg_salary_month'].value_numeric).toBeCloseTo(1575, 2);
    // All rows carry a rationale so the register keeps an audit trail
    for (const r of rows) expect(r.rationale.length).toBeGreaterThan(0);
  });

  it('stacks the slider on top of the scenario bias', () => {
    const rows = sensitivityToDeltas(
      REVENUE_ASSUMPTIONS,
      { revenueGrowth: 5, cmvmcDelta: 0, payrollDelta: 0, churnDelta: 0 },
      'optimistic',
    );
    const growth = rows.find(r => r.key === 'revenue.item1.growth');
    // 20 + 5 + 10 = 35
    expect(growth?.value_numeric).toBeCloseTo(35, 6);
  });

  it('does not emit a salary row when base salary is missing', () => {
    const noSalary = REVENUE_ASSUMPTIONS.filter(x => x.key !== 'team.avg_salary_month');
    const rows = sensitivityToDeltas(noSalary, { revenueGrowth: 0, cmvmcDelta: 0, payrollDelta: 20, churnDelta: 0 }, 'optimistic');
    expect(rows.find(r => r.key === 'team.avg_salary_month')).toBeUndefined();
  });

  it('materializes a worse churn for conservative when base churn is set', () => {
    const withChurn = [...REVENUE_ASSUMPTIONS, ...UE_ASSUMPTIONS];
    const rows = sensitivityToDeltas(withChurn, DEFAULT_SENSITIVITY, 'conservative');
    const churn = rows.find(r => r.key === 'ue.churn_monthly_pct');
    // 5 + 1 = 6
    expect(churn?.value_numeric).toBeCloseTo(6, 6);
  });

  it('does not emit a churn row when base churn is missing', () => {
    const rows = sensitivityToDeltas(REVENUE_ASSUMPTIONS, DEFAULT_SENSITIVITY, 'conservative');
    expect(rows.find(r => r.key === 'ue.churn_monthly_pct')).toBeUndefined();
  });
});

describe('computeKpis — pessimist bias moves LTV:CAC', () => {
  const all = [
    ...REVENUE_ASSUMPTIONS,
    a('ue.cac', 100, '€'),
    a('ue.arpu_month', 50, '€'),
    a('ue.gross_margin_pct', 80, '%'),
    a('ue.churn_monthly_pct', 5, '%'),
  ];
  it('conservative churn +1pp lowers LTV:CAC vs base', () => {
    const base = computeKpis(all, DEFAULT_SENSITIVITY, SCENARIO_BIAS.base);
    const cons = computeKpis(all, DEFAULT_SENSITIVITY, SCENARIO_BIAS.conservative);
    // base: 1/0.05 = 20mo × 50 × 0.8 = 800 → LTV:CAC = 8
    // cons: 1/0.06 ≈ 16.67 × 50 × 0.8 = 666.67 → LTV:CAC ≈ 6.667
    expect(base.ltvCac).toBeCloseTo(8, 4);
    expect(cons.ltvCac!).toBeLessThan(base.ltvCac!);
    expect(cons.ltvCac).toBeCloseTo(6.6667, 3);
  });
  it('optimistic churn -1pp raises LTV:CAC vs base', () => {
    const base = computeKpis(all, DEFAULT_SENSITIVITY, SCENARIO_BIAS.base);
    const opt = computeKpis(all, DEFAULT_SENSITIVITY, SCENARIO_BIAS.optimistic);
    expect(opt.ltvCac!).toBeGreaterThan(base.ltvCac!);
  });
});

