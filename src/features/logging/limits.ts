import { parseNumber, type FieldError } from '../forms/numbers';

/** Grams of one item: a typo guard, not a nutrition rule. Outside it the value is rejected, never clamped. */
export const GRAMS_RANGE = { min: 1, max: 5000 } as const;

/** Grams moved by one press of the stepper. */
export const GRAM_STEP = 10;

export function validateGrams(text: string): { error: FieldError | null; grams: number | null } {
  const parsed = parseNumber(text);
  if (parsed.kind === 'empty') return { error: { key: 'log.portion.errors.required' }, grams: null };
  if (parsed.kind === 'invalid') return { error: { key: 'log.portion.errors.number' }, grams: null };
  if (parsed.value < GRAMS_RANGE.min || parsed.value > GRAMS_RANGE.max) {
    return { error: { key: 'log.portion.errors.range', params: { ...GRAMS_RANGE } }, grams: null };
  }
  return { error: null, grams: parsed.value };
}
