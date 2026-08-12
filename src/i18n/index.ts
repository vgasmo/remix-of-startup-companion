import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Locale bundles are ~450 KB each. Keeping them out of the entry chunk and
 * loading only the active language keeps the initial JS payload small.
 * Bundles are added before the app renders (see main.tsx → initI18n) and on
 * every language switch via the `languageChanged` hook below.
 */
const loaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('./locales/en.json'),
  pt: () => import('./locales/pt.json'),
};

const savedLanguage = (typeof localStorage !== 'undefined' && localStorage.getItem('language')) || 'pt';
const initialLanguage = loaders[savedLanguage] ? savedLanguage : 'pt';

i18n
  .use(initReactI18next)
  .init({
    resources: {},
    lng: initialLanguage,
    fallbackLng: { pt: ['pt'], default: ['en'] },
    compatibilityJSON: 'v4',
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
    react: {
      // Re-render once a lazily loaded bundle is registered.
      bindI18n: 'languageChanged added loaded',
    },
  });

const loaded = new Set<string>();

export async function loadLanguage(lng: string): Promise<void> {
  const key = loaders[lng] ? lng : 'pt';
  if (loaded.has(key)) return;
  const mod = await loaders[key]();
  i18n.addResourceBundle(key, 'translation', mod.default, true, true);
  loaded.add(key);
}

export async function initI18n(): Promise<void> {
  await loadLanguage(initialLanguage);
}

i18n.on('languageChanged', (lng) => {
  void loadLanguage(lng);
});

export default i18n;
