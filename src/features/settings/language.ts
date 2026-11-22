import type { i18n as I18n } from 'i18next';

import type { Repositories } from '@/data';
import type { Locale } from '@/i18n/locale';
import { LOCALE_KEY } from '../session/AppSession';

/**
 * Changes the app language and keeps it across restarts: stored in `setting` (it exists before the
 * profile does, during onboarding) and, when a profile exists, in the profile too. The language is
 * applied first, so a failed write still leaves the screen in the language the person picked.
 */
export async function saveLocale(repos: Pick<Repositories, 'settings' | 'profile'>, i18n: Pick<I18n, 'changeLanguage'>, locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale);
  await repos.settings.set(LOCALE_KEY, locale);
  const profile = await repos.profile.get();
  if (profile && profile.locale !== locale) {
    await repos.profile.save({
      sex: profile.sex,
      birthDate: profile.birthDate,
      heightCm: profile.heightCm,
      activityLevel: profile.activityLevel,
      specialCondition: profile.specialCondition,
      unitSystem: profile.unitSystem,
      locale,
      disclaimerAcceptedAt: profile.disclaimerAcceptedAt,
      disclaimerVersion: profile.disclaimerVersion,
    });
  }
}
