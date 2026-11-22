import { NUTRIENT_CODES, NUTRIENT_UNITS, type NutrientAmounts, type NutrientCode } from '../../core/nutrition';
import { invalid } from './shared';

/**
 * The one set of numeric limits. The repositories enforce them where a value ENTERS the app (a form, a Health Connect reading, an
 * AI estimate, a barcode lookup), the forms import them for their messages, and the export format validates with them. So a
 * value that was stored can always be exported, and a value that cannot be exported can no longer be stored.
 */
const GRAMS_MAX = 5000;
const PER_100G = { kcal: { min: 0, max: 1000 }, protein: { min: 0, max: 100 }, carbs: { min: 0, max: 100 }, fat: { min: 0, max: 100 } } as const;

export const VALUE_LIMITS = {
  /** The largest portion of one item, in grams. */
  gramsMax: GRAMS_MAX,
  /** Per 100 g of a food, as a custom food or a barcode product (a typo guard, not a nutrition rule). */
  per100g: PER_100G,
  /** What one item can hold: the largest portion of the densest food. */
  item: {
    kcal: (GRAMS_MAX * PER_100G.kcal.max) / 100,
    protein: (GRAMS_MAX * PER_100G.protein.max) / 100,
    carbs: (GRAMS_MAX * PER_100G.carbs.max) / 100,
    fat: (GRAMS_MAX * PER_100G.fat.max) / 100,
  },
  /** Micronutrients come from the catalog, not from a form: this only stops a value that cannot be real. */
  nutrientMax: 1_000_000,
  /** Counters (uses, confirmations): far beyond any use of an app. */
  countMax: 1_000_000,
  /** Daily targets typed by hand. */
  targets: { kcal: { min: 500, max: 10000 }, protein: { min: 1, max: 1000 }, carbs: { min: 1, max: 1000 }, fat: { min: 1, max: 1000 } },
  heightCm: { min: 50, max: 260 },
  /** What a stored measurement may be (kg, cm, percent). */
  measurement: {
    weight: { min: 20, max: 500 },
    waist: { min: 20, max: 300 },
    hips: { min: 20, max: 300 },
    chest: { min: 20, max: 300 },
    body_fat_pct: { min: 2, max: 70 },
  },
} as const;

export function requireWithin(value: number, range: { readonly min: number; readonly max: number }, label: string): void {
  if (!Number.isFinite(value) || value < range.min || value > range.max) {
    throw invalid(`${label} must be between ${range.min} and ${range.max}, got ${value}`);
  }
}

/** An item's grams, its four headline values and its other nutrients, against what one item can hold. */
export function requireItemWithinLimits(grams: number, amounts: NutrientAmounts, label: string): void {
  requireWithin(grams, { min: 0, max: VALUE_LIMITS.gramsMax }, `${label}.grams`);
  for (const code of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    const value = amounts[code];
    if (value !== undefined) requireWithin(value, { min: 0, max: VALUE_LIMITS.item[code] }, `${label}.nutrients.${code}`);
  }
  for (const [code, value] of Object.entries(amounts)) {
    if (value === undefined || code === 'kcal' || code === 'protein' || code === 'carbs' || code === 'fat') continue;
    requireWithin(value, { min: 0, max: VALUE_LIMITS.nutrientMax }, `${label}.nutrients.${code}`);
  }
}

/**
 * Food tables a person imports (docs/guides): bounds that keep one import from filling the phone, and the physical ceiling of every
 * nutrient per 100 g. A food cannot hold more than 100 g of anything in 100 g of it, so a mass in grams is at most 100, in milligrams at
 * most 100 000; energy has the custom food ceiling. A value over its ceiling is a typo or a wrong unit: the importer reports the row,
 * it never changes the number.
 */
export const IMPORT_LIMITS = {
  /** Foods in one imported table (the largest published tables have a few thousand). */
  foodsPerCollection: 20_000,
  /** Imported tables at once. */
  collections: 30,
} as const;

const PER_100G_CEILING = { kcal: PER_100G.kcal.max, g: 100, mg: 100_000, ug: 100_000_000 } as const;

/** The largest value of a nutrient per 100 g of an imported food (never above what any stored nutrient may hold). */
export function importedPer100gMax(code: NutrientCode): number {
  return Math.min(PER_100G_CEILING[NUTRIENT_UNITS[code]], VALUE_LIMITS.nutrientMax);
}

/** Every nutrient of an imported food, against its ceiling. Unknown nutrients are simply absent. */
export function requireImportedPer100g(per100g: NutrientAmounts, label: string): void {
  for (const code of NUTRIENT_CODES) {
    const value = per100g[code];
    if (value !== undefined) requireWithin(value, { min: 0, max: importedPer100gMax(code) }, `${label}.${code}`);
  }
}
