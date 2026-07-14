// Locale-safe number parsing for founder-facing inputs.
// Handles "1.234,56" (pt-PT), "1,234.56" (en-US), "1234.56", "1234,56",
// "€1 234,56", "(1.234,56)" negatives, "1.500" (pt-PT thousands) — the last
// case is the F0 fix: a bare "1.500" MUST parse as 1500, not 1.5.

export function parseLocalizedNumber(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = String(input).trim();
  if (!s || s === '-' || s === '—') return null;

  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[\u00A0\u202F\s]/g, '').replace(/[€$£¥]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let normalized: string;

  if (hasComma && hasDot) {
    // Last separator wins as decimal.
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.');
    else normalized = s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) normalized = s.replace(/,/g, ''); // multiple => thousands
    else if (parts[1]?.length === 3 && parts[0].length > 0 && parts[0].length <= 3) {
      normalized = s.replace(/,/g, ''); // "1,234" ambiguous → thousands
    } else normalized = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    // pt-PT thousands: "1.500" or "1.234.567" → strip dots.
    if (parts.length > 2) normalized = s.replace(/\./g, '');
    else if (parts[1]?.length === 3 && parts[0].length > 0 && parts[0].length <= 3) {
      normalized = s.replace(/\./g, '');
    } else normalized = s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function formatLocalizedNumber(n: number | null, opts?: { currency?: boolean; digits?: number }): string {
  if (n === null || !Number.isFinite(n as number)) return '—';
  if (opts?.currency) {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n as number);
  }
  return new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: opts?.digits ?? 2,
    maximumFractionDigits: opts?.digits ?? 2,
  }).format(n as number);
}
