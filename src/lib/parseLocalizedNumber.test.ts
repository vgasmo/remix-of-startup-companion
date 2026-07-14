import { describe, it, expect } from 'vitest';
import { parseLocalizedNumber, formatLocalizedNumber } from './parseLocalizedNumber';

describe('parseLocalizedNumber', () => {
  it('handles null/undefined/empty', () => {
    expect(parseLocalizedNumber(null)).toBeNull();
    expect(parseLocalizedNumber(undefined)).toBeNull();
    expect(parseLocalizedNumber('')).toBeNull();
    expect(parseLocalizedNumber('   ')).toBeNull();
    expect(parseLocalizedNumber('-')).toBeNull();
    expect(parseLocalizedNumber('—')).toBeNull();
  });

  it('passes through finite numbers', () => {
    expect(parseLocalizedNumber(0)).toBe(0);
    expect(parseLocalizedNumber(1234.56)).toBe(1234.56);
    expect(parseLocalizedNumber(-42)).toBe(-42);
    expect(parseLocalizedNumber(Number.NaN)).toBeNull();
    expect(parseLocalizedNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  describe('pt-PT thousands separator (F0 fix)', () => {
    it('parses bare "1.500" as 1500, not 1.5', () => {
      expect(parseLocalizedNumber('1.500')).toBe(1500);
    });
    it('parses "1.234.567" as 1234567', () => {
      expect(parseLocalizedNumber('1.234.567')).toBe(1234567);
    });
    it('parses "1.234,56" (pt-PT) as 1234.56', () => {
      expect(parseLocalizedNumber('1.234,56')).toBe(1234.56);
    });
    it('parses "€1.500,00" as 1500', () => {
      expect(parseLocalizedNumber('€1.500,00')).toBe(1500);
    });
    it('parses "1.500,00 €" (trailing symbol) as 1500', () => {
      expect(parseLocalizedNumber('1.500,00 €')).toBe(1500);
    });
    it('parses "12.500" (pt-PT thousands) as 12500', () => {
      expect(parseLocalizedNumber('12.500')).toBe(12500);
    });
    it('preserves decimal in "1.5" when no thousands ambiguity', () => {
      // "1.5" is treated as decimal (parts[1].length !== 3)
      expect(parseLocalizedNumber('1.5')).toBe(1.5);
    });
    it('parses "0.5" as 0.5', () => {
      expect(parseLocalizedNumber('0.5')).toBe(0.5);
    });
  });

  describe('en-US formats', () => {
    it('parses "1,234.56" as 1234.56', () => {
      expect(parseLocalizedNumber('1,234.56')).toBe(1234.56);
    });
    it('parses "1,234,567.89" as 1234567.89', () => {
      expect(parseLocalizedNumber('1,234,567.89')).toBe(1234567.89);
    });
    it('parses "1,500" as 1500 (en-US thousands)', () => {
      expect(parseLocalizedNumber('1,500')).toBe(1500);
    });
    it('parses "$1,234.56" as 1234.56', () => {
      expect(parseLocalizedNumber('$1,234.56')).toBe(1234.56);
    });
  });

  describe('sign and parenthetical negatives', () => {
    it('parses "(1.234,56)" as -1234.56', () => {
      expect(parseLocalizedNumber('(1.234,56)')).toBe(-1234.56);
    });
    it('parses "-1.500" as -1500', () => {
      expect(parseLocalizedNumber('-1.500')).toBe(-1500);
    });
    it('parses "+42" as 42', () => {
      expect(parseLocalizedNumber('+42')).toBe(42);
    });
    it('double-negative "(-1,50)" as 1.5', () => {
      expect(parseLocalizedNumber('(-1,50)')).toBe(1.5);
    });
  });

  describe('whitespace and currency stripping', () => {
    it('strips normal spaces "1 500,00"', () => {
      expect(parseLocalizedNumber('1 500,00')).toBe(1500);
    });
    it('strips non-breaking spaces', () => {
      expect(parseLocalizedNumber('1\u00A0500,00')).toBe(1500);
    });
    it('strips narrow no-break spaces', () => {
      expect(parseLocalizedNumber('1\u202F500,00')).toBe(1500);
    });
  });

  describe('invalid input', () => {
    it('rejects letters', () => {
      expect(parseLocalizedNumber('abc')).toBeNull();
      expect(parseLocalizedNumber('12abc')).toBeNull();
    });
    it('collapses ambiguous "1.23.4" as thousands (strips dots) → 1234', () => {
      // Multiple dots → treated as pt-PT thousands. Documenting current behavior.
      expect(parseLocalizedNumber('1.23.4')).toBe(1234);
    });
  });

  describe('echo formatted value round-trip', () => {
    it('parses value formatted by formatLocalizedNumber (pt-PT)', () => {
      const formatted = formatLocalizedNumber(1500);
      // "1500,00" in pt-PT
      expect(parseLocalizedNumber(formatted)).toBe(1500);
    });
    it('round-trips large numbers with thousands separators', () => {
      const formatted = formatLocalizedNumber(1234567.89);
      expect(parseLocalizedNumber(formatted)).toBe(1234567.89);
    });
    it('round-trips currency-formatted values', () => {
      const formatted = formatLocalizedNumber(2500, { currency: true });
      expect(parseLocalizedNumber(formatted)).toBe(2500);
    });
    it('round-trips negatives', () => {
      const formatted = formatLocalizedNumber(-1500);
      expect(parseLocalizedNumber(formatted)).toBe(-1500);
    });
  });
});

describe('formatLocalizedNumber', () => {
  it('renders em-dash for null/NaN', () => {
    expect(formatLocalizedNumber(null)).toBe('—');
    expect(formatLocalizedNumber(Number.NaN)).toBe('—');
  });
  it('formats currency in EUR pt-PT', () => {
    expect(formatLocalizedNumber(1500, { currency: true })).toMatch(/1\.500,00.*€/);
  });
});
