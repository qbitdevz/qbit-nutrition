import type { SettingsRepository } from '@/data';

/** `setting` key holding the person's own minimum daily energy; absent means "use the default for the person's sex". */
export const MINIMUM_KCAL_KEY = 'minimum_daily_kcal';

/**
 * Sanity range for the minimum a person can set (S3). It is a guard against typos, not a guideline:
 * values outside are rejected with a message, never clamped.
 */
export const MINIMUM_KCAL_RANGE = { min: 500, max: 4000 } as const;

/** The person's own minimum, or null when the default applies. A stored value that is not a usable number counts as unset. */
export async function readMinimumKcal(settings: Pick<SettingsRepository, 'get'>): Promise<number | null> {
  const raw = await settings.get(MINIMUM_KCAL_KEY);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function writeMinimumKcal(settings: Pick<SettingsRepository, 'set' | 'remove'>, kcal: number | null): Promise<void> {
  if (kcal === null) await settings.remove(MINIMUM_KCAL_KEY);
  else await settings.set(MINIMUM_KCAL_KEY, String(kcal));
}
