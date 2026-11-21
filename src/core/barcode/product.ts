// From an Open Food Facts product to per-100 g values in the units of the tracked nutrients (docs/02 section 3).
// Rules: a value the service does not report is missing, never zero and never guessed; a value that cannot be real is
// treated as missing; values that are in range but do not add up are kept as reported and the product is flagged.
import { isFallbackPlausible } from '../ai/checks';
import { convert, type NutrientAmounts, type NutrientCode } from '../nutrition';
import type { OffProduct } from './offSchema';

/** What a product needs before it can be logged: a name and the four headline values. */
export type ProductField = 'name' | 'kcal' | 'protein' | 'carbs' | 'fat';
export const HEADLINE_FIELDS = ['kcal', 'protein', 'carbs', 'fat'] as const;

export interface BarcodeProduct {
  /** The lookup code (13 digits, or the 8 of an EAN-8). */
  barcode: string;
  /** Empty when the service has no name for it (then `missing` lists `name`). */
  name: string;
  brand: string | null;
  /** Only values the service reported (or the person typed); a missing headline value is absent, never 0. */
  per100g: NutrientAmounts;
  /** Grams in one serving, when the service gives it in grams. */
  servingG: number | null;
  missing: ProductField[];
  /** In range but not coherent: the energy does not match the macronutrients, or they weigh more than 100 g. */
  inconsistent: boolean;
  /** The person completed or corrected it (the values are theirs, not the service's). */
  edited: boolean;
}

/** Ready to log without asking the person anything. */
export const isComplete = (product: Pick<BarcodeProduct, 'missing' | 'inconsistent'>): boolean => product.missing.length === 0 && !product.inconsistent;

/** Per 100 g of anything edible: pure fat is 900 kcal, so 1,000 is a typo guard (the same bound a custom food has). */
export const MAX_KCAL_100G = 1000;
export const MAX_GRAMS_100G = 100;
/** Micronutrients: a sanity limit only. */
export const MAX_MICRO_100G = 1_000_000;
/** A serving larger than this is not a serving (the portion limit of the app). */
export const MAX_SERVING_G = 5000;
const MAX_NAME_CHARS = 120;
const MAX_BRAND_CHARS = 80;
/** Sodium is 40% of the mass of salt (EU: salt = sodium x 2.5). */
const SODIUM_G_PER_SALT_G = 0.4;

interface Source {
  /** Key stem in `nutriments`. */
  key: string;
  code: NutrientCode;
  /** Grams in the service to the unit of the tracked nutrient. */
  factor: number;
  max: number;
}

// Vitamin A is left out on purpose: labels give it in IU or in µg RAE and the service does not say which.
const OTHER: Source[] = [
  { key: 'fiber', code: 'fiber', factor: 1, max: MAX_GRAMS_100G },
  { key: 'sugars', code: 'sugars', factor: 1, max: MAX_GRAMS_100G },
  { key: 'saturated-fat', code: 'sat_fat', factor: 1, max: MAX_GRAMS_100G },
  { key: 'potassium', code: 'potassium', factor: 1e3, max: MAX_MICRO_100G },
  { key: 'calcium', code: 'calcium', factor: 1e3, max: MAX_MICRO_100G },
  { key: 'iron', code: 'iron', factor: 1e3, max: MAX_MICRO_100G },
  { key: 'magnesium', code: 'magnesium', factor: 1e3, max: MAX_MICRO_100G },
  { key: 'zinc', code: 'zinc', factor: 1e3, max: MAX_MICRO_100G },
  { key: 'vitamin-c', code: 'vit_c', factor: 1e3, max: MAX_MICRO_100G },
  { key: 'vitamin-d', code: 'vit_d', factor: 1e6, max: MAX_MICRO_100G },
  { key: 'vitamin-b12', code: 'vit_b12', factor: 1e6, max: MAX_MICRO_100G },
  { key: 'vitamin-b9', code: 'folate', factor: 1e6, max: MAX_MICRO_100G },
];

/** A number, or a number written as text (the service sends both; a decimal comma is accepted). Anything else: undefined. */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const oneLine = (value: string | undefined, max: number): string => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The first of these that is not blank, on one line. */
const firstName = (candidates: (string | undefined)[], max: number): string => candidates.map((c) => oneLine(c, max)).find((c) => c !== '') ?? '';

function servingGrams(product: OffProduct): number | null {
  const inRange = (n: number | undefined): number | null => (n !== undefined && n > 0 && n <= MAX_SERVING_G ? n : null);
  const quantity = toNumber(product.serving_quantity);
  if (quantity !== undefined) {
    // Millilitres are not grams and no density is invented.
    const unit = product.serving_quantity_unit?.trim().toLowerCase();
    return unit === undefined || unit === '' || unit === 'g' ? inRange(quantity) : null;
  }
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*g\s*$/i.exec(product.serving_size ?? '');
  return match ? inRange(toNumber(match[1])) : null;
}

export type NamePreference = 'en' | 'es';

/** Maps what the service reported. `barcode` and `fetchedAt` belong to the cache record, not to this mapping. */
export function mapProduct(raw: OffProduct, locale: NamePreference): Omit<BarcodeProduct, 'barcode' | 'edited'> {
  const n = raw.nutriments;
  const servingG = servingGrams(raw);

  /** Per 100 g: the `_100g` value, else the per-serving value scaled by the serving size. */
  const per100 = (key: string): number | undefined => {
    const direct = toNumber(n[`${key}_100g`]);
    if (direct !== undefined) return direct;
    const perServing = toNumber(n[`${key}_serving`]);
    return perServing !== undefined && servingG !== null ? (perServing * 100) / servingG : undefined;
  };

  const per100g: NutrientAmounts = {};
  const set = (code: NutrientCode, value: number | undefined, max: number) => {
    if (value !== undefined && value >= 0 && value <= max) per100g[code] = value;
  };

  // Energy: kcal as reported; otherwise kJ (an explicit kJ value, or the plain value, which the service gives in kJ unless it says kcal).
  let kcal = per100('energy-kcal');
  if (kcal === undefined) {
    const kj = per100('energy-kj');
    if (kj !== undefined) kcal = convert(kj, 'kj', 'kcal');
    else {
      const plain = per100('energy');
      if (plain !== undefined) {
        const unit = typeof n.energy_unit === 'string' ? n.energy_unit.trim().toLowerCase() : 'kj';
        kcal = unit === 'kcal' ? plain : convert(plain, 'kj', 'kcal');
      }
    }
  }
  set('kcal', kcal, MAX_KCAL_100G);
  set('protein', per100('proteins'), MAX_GRAMS_100G);
  set('carbs', per100('carbohydrates'), MAX_GRAMS_100G);
  set('fat', per100('fat'), MAX_GRAMS_100G);

  // Sodium in mg: reported sodium wins; otherwise from salt.
  const sodiumG = per100('sodium');
  const saltG = per100('salt');
  set('sodium', sodiumG !== undefined ? sodiumG * 1e3 : saltG !== undefined ? saltG * SODIUM_G_PER_SALT_G * 1e3 : undefined, MAX_MICRO_100G);
  for (const source of OTHER) {
    const value = per100(source.key);
    set(source.code, value === undefined ? undefined : value * source.factor, source.max);
  }

  const name = firstName(locale === 'es' ? [raw.product_name_es, raw.product_name, raw.product_name_en] : [raw.product_name, raw.product_name_en], MAX_NAME_CHARS);
  const brand = oneLine(raw.brands?.split(',')[0], MAX_BRAND_CHARS);

  const missing: ProductField[] = [];
  if (name === '') missing.push('name');
  for (const field of HEADLINE_FIELDS) if (per100g[field] === undefined) missing.push(field);

  const { kcal: k, protein: p, carbs: c, fat: f } = per100g;
  const inconsistent = k !== undefined && p !== undefined && c !== undefined && f !== undefined && !isFallbackPlausible({ kcal: k, protein_g: p, carbs_g: c, fat_g: f });

  return { name, brand: brand === '' ? null : brand, per100g, servingG, missing, inconsistent };
}
