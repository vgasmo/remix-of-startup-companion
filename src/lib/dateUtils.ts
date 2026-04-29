import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks, differenceInMonths, differenceInYears, format, isValid, parseISO, isFuture } from 'date-fns';
import i18n from '@/i18n';

/**
 * Get the current locale for Intl.DateTimeFormat
 */
export function getIntlLocale(): string {
  const lang = i18n.language;
  return lang === 'pt' ? 'pt-PT' : 'en-US';
}

/**
 * Format a short date (e.g., "Jan 15" or "15 jan")
 */
export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return '';
  
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Format a date with month and year (e.g., "Jan 2024" or "jan 2024")
 */
export function formatMonthYear(date: Date | string | null | undefined): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return '';
  
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'short',
    year: 'numeric',
  }).format(dateObj);
}

/**
 * Format a date with time (e.g., "Jan 15, 3:00 PM" or "15 jan, 15:00")
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return '';
  
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(dateObj);
}

/**
 * Format time only (e.g., "3:00 PM" or "15:00")
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return '';
  
  return new Intl.DateTimeFormat(getIntlLocale(), {
    hour: 'numeric',
    minute: '2-digit',
  }).format(dateObj);
}

/**
 * Format a full date (e.g., "Monday, January 15, 2024" or "segunda-feira, 15 de janeiro de 2024")
 */
export function formatFullDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return '';
  
  return new Intl.DateTimeFormat(getIntlLocale(), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Format a weekday with date (e.g., "Monday, Jan 15" or "segunda-feira, 15 jan")
 */
export function formatWeekdayDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return '';
  
  return new Intl.DateTimeFormat(getIntlLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Format a number according to current locale
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getIntlLocale(), options).format(value);
}

/**
 * Format currency according to current locale
 */
export function formatCurrency(value: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat(getIntlLocale(), {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Format percentage according to current locale
 */
export function formatPercent(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat(getIntlLocale(), {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Returns a localized relative time string (e.g., "há 2 horas" or "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  
  if (!isValid(dateObj)) return '';
  
  const now = new Date();
  const future = isFuture(dateObj);
  
  const minutes = Math.abs(differenceInMinutes(now, dateObj));
  const hours = Math.abs(differenceInHours(now, dateObj));
  const days = Math.abs(differenceInDays(now, dateObj));
  const weeks = Math.abs(differenceInWeeks(now, dateObj));
  const months = Math.abs(differenceInMonths(now, dateObj));
  const years = Math.abs(differenceInYears(now, dateObj));
  
  if (minutes < 1) {
    return i18n.t('relativeTime.justNow');
  }
  
  if (future) {
    if (minutes < 60) {
      return i18n.t('relativeTime.inMinutes', { count: minutes });
    }
    if (hours < 24) {
      return i18n.t('relativeTime.inHours', { count: hours });
    }
    return i18n.t('relativeTime.inDays', { count: days });
  }
  
  if (minutes < 60) {
    return i18n.t('relativeTime.minutesAgo', { count: minutes });
  }
  
  if (hours < 24) {
    return i18n.t('relativeTime.hoursAgo', { count: hours });
  }
  
  if (days < 7) {
    return i18n.t('relativeTime.daysAgo', { count: days });
  }
  
  if (weeks < 4) {
    return i18n.t('relativeTime.weeksAgo', { count: weeks });
  }
  
  if (months < 12) {
    return i18n.t('relativeTime.monthsAgo', { count: months });
  }
  
  return i18n.t('relativeTime.yearsAgo', { count: years });
}

/**
 * Format a date according to the current locale
 */
export function formatLocalizedDate(date: Date | string | null | undefined, formatStr: string = 'PPP'): string {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  
  if (!isValid(dateObj)) return '';
  
  return format(dateObj, formatStr);
}

/**
 * Canonical app timezone. All scheduling-facing wall-clock times
 * (consultant availability, booking slots, calendar events) are interpreted
 * in this zone unless explicitly stated otherwise.
 *
 * See memory: infrastructure/timezone-and-booking-standards
 */
export const APP_TIMEZONE = 'Europe/Lisbon';

/**
 * Returns the offset (in minutes) of Europe/Lisbon vs UTC for the given
 * instant. Positive means Lisbon is ahead of UTC. Lisbon is UTC+0 in winter
 * and UTC+1 (WEST) in summer, so this is +0 or +60.
 */
function getLisbonOffsetMinutes(date: Date): number {
  // Format the same instant in Lisbon and in UTC, then diff.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtcMs - date.getTime()) / 60000);
}

/**
 * Convert a wall-clock string like "2026-04-29T09:00:00" representing
 * Europe/Lisbon time into a correct UTC ISO string (e.g. "2026-04-29T08:00:00.000Z").
 *
 * This must be used whenever we read a slot string from the availability
 * endpoint or a manual-time input that the user expects to be Lisbon time —
 * never rely on `new Date(localString)` which uses the *browser's* timezone.
 */
export function lisbonWallClockToUtcIso(wallClock: string): string {
  const m = wallClock.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) {
    // Fallback: best-effort parse. Caller passed an already-zoned string.
    return new Date(wallClock).toISOString();
  }
  const [, y, mo, d, h, mi, s] = m;
  // Build a Date as if the wall clock were UTC, then subtract Lisbon's offset
  // for that moment to get the real UTC instant.
  const naiveUtc = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0')),
  );
  const offsetMin = getLisbonOffsetMinutes(naiveUtc);
  return new Date(naiveUtc.getTime() - offsetMin * 60_000).toISOString();
}

/**
 * Get the day of week name localized
 */
export function getLocalizedDayName(dayIndex: number): string {
  const days = [
    'settingsPage.sunday',
    'settingsPage.monday',
    'settingsPage.tuesday',
    'settingsPage.wednesday',
    'settingsPage.thursday',
    'settingsPage.friday',
    'settingsPage.saturday'
  ];
  return i18n.t(days[dayIndex] || days[0]);
}
