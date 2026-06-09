import { describe, it, expect } from 'vitest';
import {
  calculateContractPricing,
  resolveApplicableDiscounts,
  formatContractCurrency,
  type PricingInput,
  type PricingLine,
} from './pricingEngine';

/**
 * Pricing engine tests — covers the main regulatory branches of V11:
 * - base-fee selection from incubationType vs pricingLine
 * - per-sqm modality
 * - manual override
 * - non-cumulative discount selection (Startup Portugal 5% vs Associado 10%)
 * - year-over-year increase past year 3
 * - VAT (23%) computation
 * - tenure warnings (3-year / biennial review / anniversary)
 * - resolveApplicableDiscounts standalone
 */

const baseType: PricingInput['incubationType'] = {
  id: 't1',
  name: 'Incubação Física',
  base_monthly_fee: 200,
  base_currency: 'EUR',
  price_per_sqm: null,
  requires_space: false,
  is_virtual: false,
  equity_percentage: null,
  contract_type: 'incubation',
};

const flatLine: PricingLine = {
  id: 'pl1',
  designation: 'Sala Partilhada',
  startup_monthly_fee: 150,
  non_startup_monthly_fee: 250,
  startup_annual_increase_pct: 5,
  non_startup_annual_increase_pct: 7.5,
  area_sqm: null,
  is_per_sqm: false,
  is_post_incubation: false,
  max_duration_months: null,
  billing_frequency: 'monthly',
  location_type: 'shared',
};

const perSqmLine: PricingLine = {
  ...flatLine,
  id: 'pl2',
  designation: 'Gabinete Privado',
  startup_monthly_fee: 8, // €/m²
  non_startup_monthly_fee: 12,
  is_per_sqm: true,
};

describe('calculateContractPricing — base-fee selection', () => {
  it('falls back to incubation type when no pricing line is provided', () => {
    const r = calculateContractPricing({ incubationType: baseType });
    expect(r.baseFee).toBe(200);
    expect(r.baseFeeSource).toContain('Incubação Física');
    expect(r.isManualOverride).toBe(false);
  });

  it('prefers pricing line over incubation type', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      startupCategory: 'startup',
    });
    expect(r.baseFee).toBe(150);
    expect(r.baseFeeSource).toContain('Sala Partilhada');
  });

  it('uses non-startup fee column for non_startup category', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      startupCategory: 'non_startup',
    });
    expect(r.baseFee).toBe(250);
  });
});

describe('calculateContractPricing — per-sqm modality', () => {
  it('multiplies area by per-sqm price', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: perSqmLine,
      squareMeters: 12,
      startupCategory: 'startup',
    });
    expect(r.baseFee).toBe(96); // 12 × 8
  });

  it('returns zero base when area is missing', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: perSqmLine,
      startupCategory: 'startup',
    });
    expect(r.baseFee).toBe(0);
  });
});

describe('calculateContractPricing — manual override', () => {
  it('applies override and emits a warning', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      manualOverride: { fee: 99, reason: 'Deliberação CA 2026/04' },
    });
    expect(r.baseFee).toBe(99);
    expect(r.isManualOverride).toBe(true);
    expect(r.warnings.some(w => w.code === 'MANUAL_OVERRIDE')).toBe(true);
  });
});

describe('calculateContractPricing — non-cumulative discounts', () => {
  it('picks 10% Associado over 5% Startup Portugal', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      startupCategory: 'startup',
      hasStartupPortugalStatus: true,
      isAssociate: true,
    });
    expect(r.totalDiscountPercentage).toBe(10);
    const applied = r.discountCandidates.find(c => c.applied);
    expect(applied?.type).toBe('associate');
  });

  it('uses 5% when only Startup Portugal applies', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      hasStartupPortugalStatus: true,
    });
    expect(r.totalDiscountPercentage).toBe(5);
  });

  it('falls back to contract discount when higher than auto', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      hasStartupPortugalStatus: true,
      discounts: [
        {
          id: 'd1',
          discount_percentage: 25,
          start_date: '2020-01-01',
          end_date: null,
          reason: 'Bolsa CA',
        },
      ],
    });
    expect(r.totalDiscountPercentage).toBe(25);
  });

  it('no discount when none eligible', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
    });
    expect(r.totalDiscountPercentage).toBe(0);
  });
});

describe('calculateContractPricing — annual increase (year 4+)', () => {
  it('applies 5% increase for startup in year 4', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      startupCategory: 'startup',
      incubationYear: 4,
    });
    // 150 * 1.05 = 157.5
    expect(r.baseFee).toBeCloseTo(157.5, 2);
    expect(r.yearlyIncreaseApplied).toBe(5);
  });

  it('compounds the increase for year 6', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      startupCategory: 'startup',
      incubationYear: 6,
    });
    // 150 * 1.05^3 ≈ 173.64
    expect(r.baseFee).toBeCloseTo(173.64, 1);
  });

  it('uses non-startup increase pct when applicable', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      startupCategory: 'non_startup',
      incubationYear: 4,
    });
    // 250 * 1.075 = 268.75
    expect(r.baseFee).toBeCloseTo(268.75, 2);
    expect(r.yearlyIncreaseApplied).toBe(7.5);
  });

  it('does NOT apply increase in years 1–3', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      startupCategory: 'startup',
      incubationYear: 3,
    });
    expect(r.baseFee).toBe(150);
    expect(r.yearlyIncreaseApplied).toBe(0);
  });
});

describe('calculateContractPricing — VAT and totals', () => {
  it('applies 23% IVA on the effective fee', () => {
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
    });
    expect(r.vatRate).toBe(0.23);
    expect(r.vatAmount).toBeCloseTo(150 * 0.23, 2);
    expect(r.totalWithVat).toBeCloseTo(150 * 1.23, 2);
    expect(r.annualFee).toBeCloseTo(150 * 12, 2);
  });
});

describe('calculateContractPricing — tenure warnings', () => {
  it('flags the 3-year revision when contract is older than 36 months', () => {
    const oldStart = new Date();
    oldStart.setMonth(oldStart.getMonth() - 40);
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      contractStartDate: oldStart.toISOString().slice(0, 10),
    });
    expect(r.warnings.some(w => w.code === 'OVER_3_YEARS')).toBe(true);
  });

  it('warns when approaching the 3-year mark', () => {
    const start = new Date();
    start.setMonth(start.getMonth() - 32);
    const r = calculateContractPricing({
      incubationType: baseType,
      pricingLine: flatLine,
      contractStartDate: start.toISOString().slice(0, 10),
    });
    expect(r.warnings.some(w => w.code === 'APPROACHING_3_YEARS')).toBe(true);
  });
});

describe('calculateContractPricing — space surcharge', () => {
  it('adds per-sqm surcharge when incubation type requires space without a pricing line', () => {
    const r = calculateContractPricing({
      incubationType: { ...baseType, requires_space: true, price_per_sqm: 10 },
      squareMeters: 20,
    });
    expect(r.spaceSurcharge).toBe(200);
    expect(r.grossMonthlyFee).toBe(400); // 200 base + 200 surcharge
  });

  it('warns when physical type lacks area allocation', () => {
    const r = calculateContractPricing({
      incubationType: { ...baseType, requires_space: true, price_per_sqm: 10 },
    });
    expect(r.warnings.some(w => w.code === 'MISSING_SPACE')).toBe(true);
  });
});

describe('resolveApplicableDiscounts', () => {
  it('returns the best of two automatic discounts', () => {
    const r = resolveApplicableDiscounts(true, true);
    expect(r.bestPercentage).toBe(10);
    expect(r.type).toBe('associate');
  });

  it('returns zero when nothing eligible', () => {
    const r = resolveApplicableDiscounts(false, false);
    expect(r.bestPercentage).toBe(0);
    expect(r.type).toBe('none');
  });

  it('returns the highest CA deliberation when above automatic ones', () => {
    const r = resolveApplicableDiscounts(true, false, [
      { id: 'a', discount_percentage: 20, start_date: '2020-01-01', end_date: null, reason: 'CA' },
    ]);
    expect(r.bestPercentage).toBe(20);
    expect(r.type).toBe('ca_deliberation');
  });

  it('ignores expired CA deliberations', () => {
    const r = resolveApplicableDiscounts(false, false, [
      { id: 'a', discount_percentage: 30, start_date: '2020-01-01', end_date: '2020-12-31', reason: 'CA' },
    ]);
    expect(r.bestPercentage).toBe(0);
  });
});

describe('formatContractCurrency', () => {
  it('formats EUR in pt-PT locale', () => {
    const s = formatContractCurrency(1234.5);
    // pt-PT renders symbol after value with a non-breaking space
    expect(s).toMatch(/1\s?234,50/);
    expect(s).toMatch(/€/);
  });
});
