/**
 * Returns the date-fns locale that matches the currently selected i18n language.
 * Use in place of hardcoded `{ locale: pt }` so English users no longer see
 * Portuguese month/weekday names in dashboards, dataroom, feed, etc.
 *
 * Usage:
 *   import { getDateLocale } from '@/lib/dateLocale';
 *   format(date, 'dd MMM yyyy', { locale: getDateLocale() });
 *
 * Note: callers should already re-render on language change (typically via
 * useTranslation()). If a caller does not, wire it or wrap in the
 * useDateLocale() hook below.
 */
import i18next from 'i18next';
import { pt, enUS, type Locale } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

export function getDateLocale(lang?: string): Locale {
  const l = (lang ?? i18next.language ?? 'pt').toLowerCase();
  return l.startsWith('en') ? enUS : pt;
}

/** Hook variant — re-computes when the user switches language. */
export function useDateLocale(): Locale {
  const { i18n } = useTranslation();
  return getDateLocale(i18n.language);
}

/**
 * P5: language-aware relative time helper that also strips the noisy
 * "about"/"cerca de" prefix date-fns emits for round hour/day intervals.
 * Prefer this over calling `formatDistanceToNow` directly.
 */
import { formatDistanceToNow, type FormatDistanceToNowOptions } from 'date-fns';

export function timeAgo(
  date: Date | number,
  options: Omit<FormatDistanceToNowOptions, 'locale'> & { locale?: Locale } = {}
): string {
  const { locale, addSuffix = true, ...rest } = options;
  const raw = formatDistanceToNow(date, {
    addSuffix,
    locale: locale ?? getDateLocale(),
    ...rest,
  });
  // Strip the imprecise qualifiers ("about 2 hours ago" / "há cerca de 2 horas").
  return raw
    .replace(/\bcerca de\s+/gi, '')
    .replace(/\babout\s+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * P2: BCP-47 tag for Intl / toLocaleDateString calls, driven by the active
 * language instead of hardcoding 'pt-PT'.
 */
export function getIntlLocale(lang?: string): string {
  const l = (lang ?? i18next.language ?? 'pt').toLowerCase();
  return l.startsWith('en') ? 'en-GB' : 'pt-PT';
}
