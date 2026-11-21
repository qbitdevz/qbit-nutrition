import {
  EMPTY_SLOT_DUE_HOUR,
  FIBER_MIN_G_PER_1000_KCAL,
  LATE_DAY_HOUR,
  MIN_REMAINING_KCAL_FOR_SLOT,
  PROTEIN_WELL_BELOW_FRACTION,
  RECENT_DAYS_WINDOW,
  SODIUM_LIMIT_MG,
  TARGET_REACHED_KCAL_RANGE,
} from './insight-constants';
import type { NutrientAmounts } from './types';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** One day as the insight rules see it. */
export interface DayTotals {
  /** Local date, `YYYY-MM-DD`. */
  localDate: string;
  /** Sum of the day's items. A missing key means "not reported", sodium is in mg and fiber and protein in g. */
  totals: NutrientAmounts;
  /** Slots that have at least one meal. */
  filledSlots: readonly MealSlot[];
}

/** The person's daily targets; null means "no target". */
export interface Targets {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

/**
 * A suggestion as data: a code and its numbers. The UI turns it into words (docs/05 section 8), so core
 * holds no user-facing text. No code asks the person to eat less than they have, and none is medical advice.
 */
export type Insight =
  | { code: 'protein_low_late'; consumedG: number; targetG: number; remainingG: number }
  | { code: 'kcal_left_empty_slot'; slot: Exclude<MealSlot, 'snack'>; remainingKcal: number }
  | { code: 'fiber_low_recent'; gramsPer1000Kcal: number; days: number }
  | { code: 'sodium_high_recent'; averageMg: number; limitMg: number; days: number }
  | { code: 'target_reached'; kcal: number; targetKcal: number };

const MAIN_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;

const isLogged = (d: DayTotals): boolean => (d.totals.kcal ?? 0) > 0;

function addDays(localDate: string, delta: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** The `RECENT_DAYS_WINDOW` calendar days before `today`, if every one of them is in `recentDays` and logged; else null. */
function previousLoggedDays(today: string, recentDays: readonly DayTotals[]): DayTotals[] | null {
  const out: DayTotals[] = [];
  for (let i = 1; i <= RECENT_DAYS_WINDOW; i++) {
    const wanted = addDays(today, -i);
    const found = recentDays.find((d) => d.localDate === wanted && isLogged(d));
    if (!found) return null;
    out.push(found);
  }
  return out;
}

function protein(day: DayTotals, targets: Targets, hour: number): Insight | null {
  const consumed = day.totals.protein;
  const target = targets.proteinG;
  if (hour < LATE_DAY_HOUR || consumed === undefined || target === null || target <= 0) return null;
  if (consumed / target >= PROTEIN_WELL_BELOW_FRACTION) return null;
  return { code: 'protein_low_late', consumedG: Math.round(consumed), targetG: Math.round(target), remainingG: Math.round(target - consumed) };
}

function emptySlot(day: DayTotals, targets: Targets, hour: number): Insight | null {
  const target = targets.kcal;
  if (target === null) return null;
  const remaining = target - (day.totals.kcal ?? 0);
  if (remaining < MIN_REMAINING_KCAL_FOR_SLOT) return null;
  const slot = MAIN_SLOTS.find((s) => hour >= EMPTY_SLOT_DUE_HOUR[s] && !day.filledSlots.includes(s));
  return slot ? { code: 'kcal_left_empty_slot', slot, remainingKcal: Math.round(remaining) } : null;
}

function fiber(previous: DayTotals[] | null): Insight | null {
  if (!previous || previous.some((d) => d.totals.fiber === undefined)) return null;
  const grams = previous.reduce((sum, d) => sum + (d.totals.fiber ?? 0), 0);
  const kcal = previous.reduce((sum, d) => sum + (d.totals.kcal ?? 0), 0);
  const per1000 = (grams * 1000) / kcal;
  if (per1000 >= FIBER_MIN_G_PER_1000_KCAL) return null;
  return { code: 'fiber_low_recent', gramsPer1000Kcal: Math.round(per1000 * 10) / 10, days: previous.length };
}

function sodium(previous: DayTotals[] | null): Insight | null {
  if (!previous || previous.some((d) => d.totals.sodium === undefined)) return null;
  const average = previous.reduce((sum, d) => sum + (d.totals.sodium ?? 0), 0) / previous.length;
  if (average <= SODIUM_LIMIT_MG) return null;
  return { code: 'sodium_high_recent', averageMg: Math.round(average), limitMg: SODIUM_LIMIT_MG, days: previous.length };
}

function targetReached(day: DayTotals, targets: Targets): Insight | null {
  const target = targets.kcal;
  const kcal = day.totals.kcal;
  if (target === null || target <= 0 || kcal === undefined) return null;
  const ratio = kcal / target;
  if (ratio < TARGET_REACHED_KCAL_RANGE.min || ratio > TARGET_REACHED_KCAL_RANGE.max) return null;
  return { code: 'target_reached', kcal: Math.round(kcal), targetKcal: Math.round(target) };
}

/**
 * At most one suggestion for the day summary (docs/07 section 7), the first rule that applies, in this
 * priority order:
 *  1. protein well below target late in the day;
 *  2. calories remaining with a main meal slot still empty;
 *  3. fiber low over the last three days;
 *  4. sodium high over the last three days;
 *  5. target reached (a neutral confirmation).
 * A day with nothing logged gets none: an empty log may only mean the person has not logged yet. A rule
 * whose input is missing (no target, nutrient not reported, fewer than three logged previous days) does
 * not apply. `now` supplies the local hour; nothing else reads the clock.
 */
export function pickInsight(day: DayTotals, targets: Targets, recentDays: readonly DayTotals[], now: Date): Insight | null {
  if (!isLogged(day)) return null;
  const hour = now.getHours();
  const previous = previousLoggedDays(day.localDate, recentDays);
  return (
    protein(day, targets, hour) ??
    emptySlot(day, targets, hour) ??
    fiber(previous) ??
    sodium(previous) ??
    targetReached(day, targets)
  );
}
