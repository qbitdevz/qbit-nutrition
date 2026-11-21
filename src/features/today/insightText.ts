import type { TFunction } from 'i18next';

import type { Insight } from '@/core/nutrition';
import { formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';

/**
 * The wording of an insight (docs/05 section 8): core returns a code and numbers, and the UI layer
 * turns it into plain, neutral words in the person's language. Every code has an English and a
 * Spanish string (`insight.*` in `src/i18n`).
 */
export function insightMessage(t: TFunction, locale: Locale, insight: Insight): string {
  const n = (value: number) => formatNumber(locale, value);
  switch (insight.code) {
    case 'protein_low_late':
      return t('insight.protein_low_late', { remainingG: n(insight.remainingG) });
    case 'kcal_left_empty_slot':
      return t(`insight.kcal_left_empty_slot.${insight.slot}`, { remainingKcal: n(insight.remainingKcal) });
    case 'fiber_low_recent':
      return t('insight.fiber_low_recent', {
        days: n(insight.days),
        gramsPer1000Kcal: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(insight.gramsPer1000Kcal),
      });
    case 'sodium_high_recent':
      return t('insight.sodium_high_recent', { days: n(insight.days), averageMg: n(insight.averageMg), limitMg: n(insight.limitMg) });
    case 'target_reached':
      return t('insight.target_reached', { kcal: n(insight.kcal), targetKcal: n(insight.targetKcal) });
    default: {
      const unreachable: never = insight;
      return String(unreachable);
    }
  }
}
