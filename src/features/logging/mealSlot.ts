import type { MealSlot } from '@/core/nutrition';

/**
 * The meal slot a meal logged at `at` most likely belongs to (flow D: preselected, the person can
 * change it): breakfast 04:00-10:59, lunch 11:00-14:59, a snack 15:00-17:59, dinner 18:00-21:59, and
 * a late snack from 22:00 to 03:59. Local device time.
 */
export function pickSlot(at: Date): MealSlot {
  const hour = at.getHours();
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'snack';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'snack';
}

/** Order of the slot choices on the review screen (design artboard: breakfast, lunch, snack, dinner). */
export const SLOT_ORDER: readonly MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
