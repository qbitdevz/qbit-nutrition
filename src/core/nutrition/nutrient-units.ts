import type { NutrientCode } from './types';

/**
 * The unit each tracked nutrient is stored in (the same as `catalog.db`, `scripts/catalog/trackedNutrients.ts`), and the rules
 * for bringing a value written in another unit to it. Used when a person imports a food table: every value is converted once,
 * by these rules, and the rules are shown to the person before anything is written.
 */
export type NutrientUnit = 'kcal' | 'g' | 'mg' | 'ug';
/** Units a table may state; `iu` (international units) converts only where that is exact. */
export type SourceUnit = 'kcal' | 'kj' | 'g' | 'mg' | 'ug' | 'iu';

export const SOURCE_UNITS: readonly SourceUnit[] = ['kcal', 'kj', 'g', 'mg', 'ug', 'iu'];

export const NUTRIENT_UNITS: Readonly<Record<NutrientCode, NutrientUnit>> = {
  kcal: 'kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
  fiber: 'g',
  sugars: 'g',
  sat_fat: 'g',
  sodium: 'mg',
  potassium: 'mg',
  calcium: 'mg',
  iron: 'mg',
  magnesium: 'mg',
  zinc: 'mg',
  vit_a: 'ug',
  vit_c: 'mg',
  vit_d: 'ug',
  vit_b12: 'ug',
  folate: 'ug',
};

/** 1 kcal = 4.184 kJ (thermochemical calorie, the definition food tables use). */
export const KJ_PER_KCAL = 4.184;
/** Vitamin D: 40 IU = 1 µg (the same for D2 and D3). */
export const VITAMIN_D_IU_PER_UG = 40;

export type UnitRule =
  | { kind: 'same' }
  | { kind: 'divide'; by: number }
  | { kind: 'multiply'; by: number }
  /** `iu_ambiguous`: the factor depends on the compound (vitamin A: retinol or carotenes) or is not a convention tables use. `incompatible`: a different kind of quantity. */
  | { kind: 'refused'; reason: 'iu_ambiguous' | 'incompatible' };

/** Powers of ten between the mass units, as the exact integer to multiply or divide by (never an inexact 0.001). */
const MASS_STEPS: Record<'g' | 'mg' | 'ug', number> = { g: 1, mg: 1000, ug: 1_000_000 };

/** How a value in `from` becomes a value in the unit `code` is stored in. */
export function unitRule(from: SourceUnit, code: NutrientCode): UnitRule {
  const target = NUTRIENT_UNITS[code];
  if (target === 'kcal') {
    if (from === 'kcal') return { kind: 'same' };
    if (from === 'kj') return { kind: 'divide', by: KJ_PER_KCAL };
    return { kind: 'refused', reason: 'incompatible' };
  }
  if (from === 'kcal' || from === 'kj') return { kind: 'refused', reason: 'incompatible' };
  if (from === 'iu') {
    // Only vitamin D has one exact, universal factor. Vitamin A (IU depend on retinol or beta-carotene) and the rest are refused.
    return code === 'vit_d' ? { kind: 'divide', by: VITAMIN_D_IU_PER_UG } : { kind: 'refused', reason: 'iu_ambiguous' };
  }
  if (from === target) return { kind: 'same' };
  const ratio = MASS_STEPS[target] / MASS_STEPS[from];
  return ratio > 1 ? { kind: 'multiply', by: ratio } : { kind: 'divide', by: MASS_STEPS[from] / MASS_STEPS[target] };
}

/** `value` in the unit `code` is stored in, or null when the rule refuses. Division and multiplication by exact numbers only; no rounding. */
export function toNutrientUnit(value: number, from: SourceUnit, code: NutrientCode): number | null {
  const rule = unitRule(from, code);
  switch (rule.kind) {
    case 'same':
      return value;
    case 'divide':
      return value / rule.by;
    case 'multiply':
      return value * rule.by;
    case 'refused':
      return null;
  }
}

/** The unit a header's text names (`mg`, `µg`, `mcg`, `kJ`, `IU`...), or null. Case-insensitive; `µ` and `μ` both count. */
export function parseSourceUnit(text: string): SourceUnit | null {
  const t = text.trim().toLowerCase().replace(/[µμ]/g, 'u');
  if (t === 'kcal' || t === 'kcals') return 'kcal';
  if (t === 'kj') return 'kj';
  if (t === 'g' || t === 'gr' || t === 'grs') return 'g';
  if (t === 'mg' || t === 'mgs') return 'mg';
  if (t === 'ug' || t === 'mcg' || t === 'mcgs') return 'ug';
  if (t === 'iu' || t === 'ui' || t === 'ue') return 'iu';
  return null;
}
