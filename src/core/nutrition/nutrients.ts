import type { FoodNutrition, NutrientAmounts, NutrientCode } from './types';

/** Nutrients of `food` for `grams` of it. Not rounded: rounding belongs to display. */
export function computeItemNutrients(food: FoodNutrition, grams: number): NutrientAmounts {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new RangeError(`grams must be a finite number >= 0, got ${grams}`);
  }
  const factor = grams / 100;
  const out: NutrientAmounts = {};
  for (const [code, per100] of Object.entries(food.per100g) as [NutrientCode, number | undefined][]) {
    if (per100 !== undefined) out[code] = per100 * factor;
  }
  return out;
}

/** Per-nutrient sum. A nutrient appears in the result if at least one item reports it. */
export function sumNutrients(items: readonly NutrientAmounts[]): NutrientAmounts {
  const out: NutrientAmounts = {};
  for (const item of items) {
    for (const [code, amount] of Object.entries(item) as [NutrientCode, number | undefined][]) {
      if (amount !== undefined) out[code] = (out[code] ?? 0) + amount;
    }
  }
  return out;
}
