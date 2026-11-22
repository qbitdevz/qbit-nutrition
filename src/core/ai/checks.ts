// Device-side checks after schema validation: docs/07 section 4.
import type { ItemWarning, MealWarning, ScanChecks } from './types';
import type { ScanResult } from './schema';

/** Energy may differ from 4 × protein + 4 × carbs + 9 × fat by this fraction (fibre, alcohol, rounding)… */
export const FALLBACK_ENERGY_TOLERANCE = 0.25;
/** …or by this many kcal, whichever is larger (keeps low-energy foods from failing on rounding). */
export const FALLBACK_ENERGY_SLACK_KCAL = 20;
/** Per-item weight limits. They flag; they never block. */
export const ITEM_WEIGHT_TINY_G = 2;
export const ITEM_WEIGHT_EXTREME_G = 1200;
/** Per-meal weight limit. */
export const MEAL_WEIGHT_EXTREME_G = 2500;

type Fallback = ScanResult['items'][number]['fallback_per_100g'];

export function isFallbackPlausible(f: Fallback): boolean {
  // Macronutrients cannot weigh more than the 100 g they are measured in.
  if (f.protein_g + f.carbs_g + f.fat_g > 100.5) return false;
  const fromMacros = 4 * f.protein_g + 4 * f.carbs_g + 9 * f.fat_g;
  const tolerance = Math.max(FALLBACK_ENERGY_SLACK_KCAL, FALLBACK_ENERGY_TOLERANCE * Math.max(f.kcal, fromMacros));
  return Math.abs(f.kcal - fromMacros) <= tolerance;
}

export function checkScanResult(result: ScanResult): ScanChecks {
  const items = result.items.map((item) => {
    const warnings: ItemWarning[] = [];
    const fallbackUsable = isFallbackPlausible(item.fallback_per_100g);
    if (!fallbackUsable) warnings.push('fallback_implausible');
    if (item.grams > ITEM_WEIGHT_EXTREME_G) warnings.push('item_weight_extreme');
    if (item.grams < ITEM_WEIGHT_TINY_G) warnings.push('item_weight_tiny');
    return { fallbackUsable, warnings };
  });
  const mealWarnings: MealWarning[] = [];
  const total = result.items.reduce((sum, item) => sum + item.grams, 0);
  if (total > MEAL_WEIGHT_EXTREME_G) mealWarnings.push('meal_weight_extreme');
  return { items, mealWarnings };
}
