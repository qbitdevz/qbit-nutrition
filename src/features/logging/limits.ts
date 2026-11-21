import { parseNumber, type FieldError } from '../forms/numbers';

/** Grams of one item: a typo guard, not a nutrition rule. Outside it the value is rejected, never clamped. */
export const GRAMS_RANGE = { min: 1, max: 5000 } as const;

/** Per 100 g of a custom food, as the form accepts it. The export format reuses these, so a file cannot hold a food the form would refuse. */
export const CUSTOM_FOOD_RANGES = { kcal: { min: 0, max: 1000 }, protein: { min: 0, max: 100 }, carbs: { min: 0, max: 100 }, fat: { min: 0, max: 100 }, portion: GRAMS_RANGE } as const;

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
