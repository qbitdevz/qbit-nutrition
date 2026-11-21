import type { TFunction } from 'i18next';

import { formatNumber } from '@/i18n/format';
import type { Locale } from '@/i18n/locale';
import type { FieldError } from '../forms/numbers';
import { GRAMS_RANGE } from './limits';

/** The message for a rejected grams value on the review and meal screens ("Enter grams from 1 to 5,000."). */
export function gramsMessage(t: TFunction, locale: Locale, problem: FieldError): string {
  if (problem.key === 'log.portion.errors.range') {
    return t('log.review.gramsError', { min: formatNumber(locale, GRAMS_RANGE.min), max: formatNumber(locale, GRAMS_RANGE.max) });
  }
  return t(problem.key);
}
