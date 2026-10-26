import { describe, it, expect } from 'vitest';
import { computeEffectiveDiscount } from './contractLifecycle';
import { calculatePricing } from './pricingEngine';

const today = new Date('2026-10-26');
const row = (pct: number, reason = 'CA') => ({ discount_percentage: pct, start_date: '2026-01-01', end_date: null, reason }) as never;

describe('discounts never stack — largest wins', () => {
  it('two active contract discounts (10% and 15%) give 15%, not 25%', () => {
    expect(computeEffectiveDiscount([row(10), row(15)], null, null, today).effectivePct).toBe(15);
  });
  it('a larger legacy discount (20%) beats a smaller active one (10%)', () => {
    expect(computeEffectiveDiscount([row(10)], 20, 'legado', today).effectivePct).toBe(20);
  });
  it('a larger active discount (15%) beats a smaller legacy one (5%)', () => {
    expect(computeEffectiveDiscount([row(15)], 5, 'legado', today).effectivePct).toBe(15);
  });
});
