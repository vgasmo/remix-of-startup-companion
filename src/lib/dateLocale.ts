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
