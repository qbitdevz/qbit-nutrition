import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import es from './es.json';
import { DEFAULT_LOCALE, resolveLocale, type Locale } from './locale';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: resolveLocale(getLocales()[0]?.languageCode),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

/** The language of the device, or English when it is not one the app has: what the app uses before anyone chose a language. */
export const deviceLocale = (): Locale => resolveLocale(getLocales()[0]?.languageCode);

export default i18n;
