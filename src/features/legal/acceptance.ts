import type { Repositories } from '@/data';
import type { Locale } from '@/i18n/locale';
import { DISCLAIMER_VERSION } from './version';

/**
 * Records that the person accepted the current text of the health notice (docs/12 section 2: "Acceptance is recorded with the text
 * version, and the user is asked again when the text changes"). Everything else in the profile stays as it was; a phone with no
 * profile row yet gets a minimal one.
 */
export async function acceptCurrentNotice(repos: Pick<Repositories, 'profile'>, locale: Locale, at: Date): Promise<void> {
  const profile = await repos.profile.get();
  await repos.profile.save({
    sex: profile?.sex ?? null,
    birthDate: profile?.birthDate ?? null,
    heightCm: profile?.heightCm ?? null,
    activityLevel: profile?.activityLevel ?? null,
    specialCondition: profile?.specialCondition ?? null,
    unitSystem: profile?.unitSystem ?? 'metric',
    locale: profile?.locale ?? locale,
    disclaimerAcceptedAt: at.toISOString(),
    disclaimerVersion: DISCLAIMER_VERSION,
  });
}
