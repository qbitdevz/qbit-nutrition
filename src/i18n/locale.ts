export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Maps a device language code to a supported locale; anything else falls back to English. */
export function resolveLocale(languageCode: string | null | undefined): Locale {
  const code = languageCode?.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(code as Locale) ? (code as Locale) : DEFAULT_LOCALE;
}
