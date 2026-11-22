import type { TFunction } from 'i18next';

import { GoalConflictError } from '@/data';
import { formatLongDate } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';

/**
 * The sentence that explains a refused goal change (S10), with the dates, or null when `error` is not a goal conflict. A stored goal is
 * never changed by a refused save, so every message ends by saying nothing was changed.
 */
export function goalConflictMessage(t: TFunction, locale: Locale, error: unknown): string | null {
  if (!(error instanceof GoalConflictError)) return null;
  const today = formatLongDate(locale, error.newStart);
  if (error.reason === 'history_overlap' || !error.openGoal) return t('goal.conflict.overlap', { today });
  return t('goal.conflict.later', { open: formatLongDate(locale, error.openGoal.startDate), today });
}
