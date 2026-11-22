import { addDays, deriveMealTime, type Repositories, type SaveMealInput } from '@/data';
import { DISCLAIMER_VERSION } from '../legal/version';

/**
 * DEVELOPMENT ONLY. Inserts a profile, a goal, and two days of meals so Today can be checked with
 * data. It is reached only from `DevSeedButton`, which `TodayScreen` loads behind `__DEV__`, so
 * Metro leaves this module out of release bundles.
 */

interface SeedMeal {
  slot: SaveMealInput['slot'];
  hour: number;
  minute: number;
  name: string;
  /** Per meal: calories, protein, carbs, fat, and the grams the item stands for. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  grams: number;
}

const TODAY: SeedMeal[] = [
  { slot: 'breakfast', hour: 8, minute: 5, name: 'Greek yogurt, berries, granola', kcal: 412, protein: 24, carbs: 40, fat: 18, grams: 320 },
  { slot: 'lunch', hour: 13, minute: 10, name: 'Chicken burrito bowl', kcal: 624, protein: 41, carbs: 68, fat: 22, grams: 450 },
  { slot: 'snack', hour: 16, minute: 30, name: 'Banana and cottage cheese', kcal: 200, protein: 13, carbs: 23, fat: 7, grams: 260 },
];

const YESTERDAY: SeedMeal[] = [
  { slot: 'breakfast', hour: 7, minute: 50, name: 'Oatmeal with banana', kcal: 380, protein: 14, carbs: 62, fat: 9, grams: 350 },
  { slot: 'lunch', hour: 12, minute: 45, name: 'Grilled salmon, rice and broccoli', kcal: 640, protein: 44, carbs: 58, fat: 24, grams: 480 },
  { slot: 'dinner', hour: 20, minute: 15, name: 'Veggie omelette and toast', kcal: 520, protein: 28, carbs: 36, fat: 28, grams: 380 },
];

function at(now: Date, daysAgo: number, hour: number, minute: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Returns false (and writes nothing) when today already has meals. */
export async function seedSampleDay(repos: Repositories, now: Date = new Date()): Promise<boolean> {
  const today = deriveMealTime(now).localDate;
  if ((await repos.meals.getDay(today)).meals.length > 0) return false;

  if (!(await repos.profile.get())) {
    await repos.profile.save({
      sex: 'male',
      birthDate: '1990-05-14',
      heightCm: 175,
      activityLevel: 'moderate',
      unitSystem: 'metric',
      locale: 'en',
      disclaimerAcceptedAt: now.toISOString(),
      disclaimerVersion: DISCLAIMER_VERSION,
    });
  }
  if (!(await repos.goals.current())) {
    await repos.goals.set({
      type: 'maintain',
      startDate: addDays(today, -30),
      kcalTarget: 2100,
      proteinGTarget: 150,
      carbsGTarget: 220,
      fatGTarget: 70,
      isCustom: true,
      formulaVersion: 'dev-seed',
    });
  }

  for (const [daysAgo, meals] of [
    [1, YESTERDAY],
    [0, TODAY],
  ] as const) {
    for (const m of meals) {
      await repos.meals.save({
        eatenAt: at(now, daysAgo, m.hour, m.minute),
        slot: m.slot,
        source: 'manual',
        items: [
          {
            displayName: m.name,
            grams: m.grams,
            foodSource: 'ai_estimate',
            foodRef: null,
            origin: 'manual',
            nutrients: { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat },
          },
        ],
      });
    }
  }
  return true;
}
