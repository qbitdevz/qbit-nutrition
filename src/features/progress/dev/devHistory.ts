import { addDays, deriveMealTime, type Repositories } from '@/data';
import { DISCLAIMER_VERSION } from '../../legal/version';

/**
 * DEVELOPMENT ONLY (QN_DEV_ONLY_HISTORY). Writes about five weeks of meals, a goal change ten days ago, weights every few days and a
 * few waist measurements, so Progress can be checked with data. Reached only from `DevHistoryButton`, which
 * `ProgressScreen` loads behind `__DEV__`, so Metro leaves this module out of release bundles.
 */
const MEALS = [
  { slot: 'breakfast', hour: 8, share: 0.25, name: 'Breakfast' },
  { slot: 'lunch', hour: 13, share: 0.4, name: 'Lunch' },
  { slot: 'dinner', hour: 20, share: 0.35, name: 'Dinner' },
] as const;

/** Returns false (and writes nothing) when the last five weeks already have meals. */
export async function seedSampleHistory(repos: Repositories, now: Date = new Date()): Promise<boolean> {
  const today = deriveMealTime(now).localDate;
  if ((await repos.meals.totalsByDay(addDays(today, -34), today)).length > 0) return false;

  if (!(await repos.profile.get())) {
    await repos.profile.save({
      sex: 'female',
      birthDate: '1991-04-03',
      heightCm: 166,
      activityLevel: 'moderate',
      unitSystem: 'metric',
      locale: 'en',
      disclaimerAcceptedAt: now.toISOString(),
      disclaimerVersion: DISCLAIMER_VERSION,
    });
  }
  const current = await repos.goals.current();
  if (!current) {
    await repos.goals.set({ type: 'maintain', startDate: addDays(today, -60), kcalTarget: 2100, proteinGTarget: 130, carbsGTarget: 240, fatGTarget: 70, isCustom: true, formulaVersion: 'dev-seed' });
  }
  if (!current || current.startDate < addDays(today, -10)) {
    await repos.goals.set({ type: 'lose_fat', pace: 'gentle', startDate: addDays(today, -10), kcalTarget: 1900, proteinGTarget: 140, carbsGTarget: 200, fatGTarget: 62, isCustom: true, formulaVersion: 'dev-seed' });
  }

  for (let ago = 34; ago >= 0; ago--) {
    if (ago % 6 === 3) continue; // a few days without meals
    const day = new Date(now);
    day.setDate(day.getDate() - ago);
    const total = 1750 + ((ago * 137) % 520);
    for (const meal of MEALS) {
      const at = new Date(day);
      at.setHours(meal.hour, 0, 0, 0);
      const kcal = Math.round(total * meal.share);
      await repos.meals.save({
        eatenAt: at,
        slot: meal.slot,
        source: 'manual',
        items: [
          {
            displayName: meal.name,
            grams: 300,
            foodSource: 'ai_estimate',
            foodRef: null,
            origin: 'manual',
            nutrients: { kcal, protein: Math.round(kcal * 0.075), carbs: Math.round(kcal * 0.11), fat: Math.round(kcal * 0.033) },
          },
        ],
      });
    }
  }

  const weights = [68.6, 68.4, 68.7, 68.1, 68.0, 67.8, 67.9, 67.5, 67.3, 67.4, 67.0];
  for (let i = 0; i < weights.length; i++) {
    await repos.measurements.record({ measuredOn: addDays(today, -(weights.length - 1 - i) * 3), kind: 'weight', value: weights[i]! });
  }
  const waist = [78, 77.5, 77.2, 76.4];
  for (let i = 0; i < waist.length; i++) {
    await repos.measurements.record({ measuredOn: addDays(today, -(waist.length - 1 - i) * 9), kind: 'waist', value: waist[i]! });
  }
  return true;
}
