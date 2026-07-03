/**
 * contractLifecycle — canonical thresholds and helpers for contract lifecycle math.
 *
 * Multiple surfaces (BackofficeDashboard, BackofficeContractsTab, ContractLifecycleEventsCard,
 * ContractLifecycleHub, check-contract-anniversaries edge function) all computed
 * expiry/anniversary/notice windows with slightly different day thresholds.
 * This module unifies them so alerts, badges, and the edge cron stay in sync.
 */
import { addYears, addMonths, differenceInDays, subDays } from 'date-fns';

/** Canonical thresholds (in days). Change here and every surface updates. */
export const LIFECYCLE_THRESHOLDS = {
  /** Show "expiring soon" when end_date is within this many days. */
  expiringSoonDays: 90,
  /** Show "expiring critical" when end_date is within this many days. */
  expiringCriticalDays: 30,
  /** Show anniversary window when next contract-year anniversary is this close. */
  anniversaryWindowDays: 60,
  /** Bump anniversary to warning when within this many days. */
  anniversaryWarningDays: 15,
  /** Biennial (24-month) price review window. */
  biennialReviewWindowDays: 90,
  biennialReviewCriticalDays: 30,
  /** Regulatory notice must be sent this many days before a price review takes effect. */
  noticePeriodDays: 60,
  /** 3-year incubation limit warning window. */
  incubationLimitWindowDays: 90,
  incubationLimitCriticalDays: 30,
  /** Default contract duration when the user asks for "+12 meses". */
  defaultRenewalMonths: 12,
} as const;

export interface ContractLite {
  start_date: string;
  end_date: string | null;
  status: string;
}

/** Days remaining until end_date; null if no end_date. */
export function daysUntilEnd(contract: ContractLite, today: Date = new Date()): number | null {
  if (!contract.end_date) return null;
  return differenceInDays(new Date(contract.end_date), today);
}

/** Whether a contract is inside the expiring-soon window. */
export function isExpiringSoon(contract: ContractLite, today: Date = new Date()): boolean {
  const d = daysUntilEnd(contract, today);
  return d !== null && d >= 0 && d <= LIFECYCLE_THRESHOLDS.expiringSoonDays;
}

/** Whether a contract is inside the expiring-critical window. */
export function isExpiringCritical(contract: ContractLite, today: Date = new Date()): boolean {
  const d = daysUntilEnd(contract, today);
  return d !== null && d >= 0 && d <= LIFECYCLE_THRESHOLDS.expiringCriticalDays;
}

/** Whether the contract silently skips renewal alerts (no end_date). */
export function isSilentOnRenewal(contract: ContractLite): boolean {
  return contract.status === 'active' && !contract.end_date;
}

/** Suggest a renewal window: start = day after current end, end = +N months. */
export function suggestRenewalWindow(
  contract: ContractLite,
  months = LIFECYCLE_THRESHOLDS.defaultRenewalMonths,
): { start: string; end: string } {
  const currentEnd = contract.end_date ? new Date(contract.end_date) : new Date();
  const newStart = new Date(currentEnd);
  newStart.setDate(newStart.getDate() + 1);
  const newEnd = addMonths(newStart, months);
  return {
    start: newStart.toISOString().slice(0, 10),
    end: newEnd.toISOString().slice(0, 10),
  };
}

/**
 * Compute the next contract anniversary using calendar-exact math.
 * Adds whole years to start_date until the resulting date is strictly after today.
 * (Avoids the ~30.44-day approximation that drifts across leap years.)
 */
export function nextAnniversary(contract: ContractLite, today: Date = new Date()): Date {
  const start = new Date(contract.start_date);
  let years = Math.max(0, today.getFullYear() - start.getFullYear());
  let candidate = addYears(start, years);
  while (candidate <= today) {
    years += 1;
    candidate = addYears(start, years);
  }
  return candidate;
}

/** Full years completed on the contract as of `today` (calendar-exact). */
export function yearsCompleted(contract: ContractLite, today: Date = new Date()): number {
  const start = new Date(contract.start_date);
  let years = Math.max(0, today.getFullYear() - start.getFullYear());
  // Walk back if we haven't reached the anniversary yet this year.
  while (years > 0 && addYears(start, years) > today) years -= 1;
  return years;
}


/** Days until the next biennial (24-month cadence) price review from start_date. */
export function daysUntilBiennialReview(contract: ContractLite, today: Date = new Date()): number {
  const start = new Date(contract.start_date);
  const yearsSince = Math.floor(differenceInDays(today, start) / 365.25);
  const nextReviewYear = yearsSince < 2 ? 2 : yearsSince + (yearsSince % 2 === 0 ? 2 : 1);
  const nextReview = addYears(start, nextReviewYear);
  return differenceInDays(nextReview, today);
}

/** Notice window: 60 days before a biennial review. */
export function noticeDeadline(contract: ContractLite, today: Date = new Date()): Date {
  const start = new Date(contract.start_date);
  const yearsSince = Math.floor(differenceInDays(today, start) / 365.25);
  const nextReviewYear = yearsSince < 2 ? 2 : yearsSince + (yearsSince % 2 === 0 ? 2 : 1);
  const nextReview = addYears(start, nextReviewYear);
  return subDays(nextReview, LIFECYCLE_THRESHOLDS.noticePeriodDays);
}

// ─────────────────────────────────────────────────────────────────────────────
// Effective discount — one rule, used by map, drawer, billing snapshot, console.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContractDiscountRow {
  id?: string;
  discount_percentage: number;
  start_date: string;
  end_date: string | null;
  reason: string | null;
}

export interface EffectiveDiscount {
  /** Applied percentage (0–100). */
  effectivePct: number;
  /** Where it came from — 'table' = contract_discounts, 'legacy' = column, 'none'. */
  source: 'table' | 'legacy' | 'none';
  /** Human-readable reason (empty when source === 'none'). */
  reason: string;
}

/**
 * Canonical discount resolver shared by every space/contract surface.
 * Prefers active rows in `contract_discounts` (single best via
 * `resolveApplicableDiscounts`); falls back to the legacy
 * `startup_contracts.discount_percentage` column only when no table
 * rows are currently active.
 */
export function computeEffectiveDiscount(
  discounts: ContractDiscountRow[] | null | undefined,
  legacyPct: number | null | undefined,
  legacyReason?: string | null,
  today: Date = new Date(),
): EffectiveDiscount {
  const active = (discounts ?? []).filter(d => {
    const start = new Date(d.start_date);
    const end = d.end_date ? new Date(d.end_date) : null;
    return start <= today && (!end || end >= today);
  });
  if (active.length) {
    // Best (highest) — matches resolveApplicableDiscounts behaviour.
    const best = active.reduce((a, b) => (b.discount_percentage > a.discount_percentage ? b : a));
    return {
      effectivePct: Number(best.discount_percentage) || 0,
      source: 'table',
      reason: best.reason || 'Deliberação CA',
    };
  }
  const legacy = Number(legacyPct) || 0;
  if (legacy > 0) {
    return { effectivePct: legacy, source: 'legacy', reason: legacyReason || '' };
  }
  return { effectivePct: 0, source: 'none', reason: '' };
}

