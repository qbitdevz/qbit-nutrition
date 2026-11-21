import { MIN_REMAINING_KCAL_FOR_SUGGESTIONS, type SuggestInput } from '@/core/ai';
import type { TodayData } from '../today/loadToday';

export type SuggestAvailability =
  /** There is something to suggest for: these numbers are all that would be sent (with the locale). */
  | { kind: 'ready'; remaining: SuggestInput['remaining']; goal: NonNullable<TodayData['goalType']> }
  /** No goal or no calorie target: there is no "what is left". */
  | { kind: 'no_targets' }
  /** Nothing or almost nothing is left: the provider is not called. */
  | { kind: 'nothing_left' }
  /** Suggestions are for today only. */
  | { kind: 'not_today' };

const tenth = (value: number) => Math.round(value * 10) / 10;

/**
 * What a suggestion request would carry, from a loaded day: the targets minus what was eaten, never below zero, and the goal
 * type. Nothing else of the day is read here, so nothing else can be sent (S6). A macro without a target is `null`, not a guess.
 */
export function suggestAvailability(day: Pick<TodayData, 'isToday' | 'totals' | 'targets' | 'goalType'>): SuggestAvailability {
  if (!day.isToday) return { kind: 'not_today' };
  const { targets, totals, goalType } = day;
  if (targets.kcal === null || targets.kcal <= 0 || goalType === null) return { kind: 'no_targets' };

  const left = (target: number | null, eaten: number): number | null => (target === null ? null : Math.max(0, tenth(target - eaten)));
  const kcal = Math.max(0, Math.round(targets.kcal - totals.kcal));
  if (kcal < MIN_REMAINING_KCAL_FOR_SUGGESTIONS) return { kind: 'nothing_left' };
  return {
    kind: 'ready',
    goal: goalType,
    remaining: { kcal, proteinG: left(targets.proteinG, totals.proteinG), carbsG: left(targets.carbsG, totals.carbsG), fatG: left(targets.fatG, totals.fatG) },
  };
}
