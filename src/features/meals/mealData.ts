import { NUTRIENT_CODES, type NutrientAmounts, type NutrientCode } from '@/core/nutrition';
import type { MealItem, MealWithItems, SaveMealInput, SaveMealItemInput } from '@/data';

/** All the nutrients of one saved item (the four headline columns plus the side table) in `NutrientAmounts` form. */
export function itemNutrients(item: MealItem): NutrientAmounts {
  return { ...item.nutrients, kcal: item.kcal, protein: item.proteinG, carbs: item.carbsG, fat: item.fatG };
}

export interface NutrientLine {
  code: NutrientCode;
  /** The sum over the items that report it; null when none does ("not reported", never a false zero). */
  total: number | null;
  /** True when some, but not all, items report it: the total understates the meal. */
  partial: boolean;
}

/** The nutrient detail of a meal (FR-42), in the order of `NUTRIENT_CODES`. */
export function nutrientLines(meal: Pick<MealWithItems, 'items'>): NutrientLine[] {
  const amounts = meal.items.map(itemNutrients);
  return NUTRIENT_CODES.map((code) => {
    const reporting = amounts.filter((a) => a[code] !== undefined);
    if (reporting.length === 0) return { code, total: null, partial: false };
    return { code, total: reporting.reduce((sum, a) => sum + (a[code] ?? 0), 0), partial: reporting.length < amounts.length };
  });
}

const toInput = (item: MealItem): SaveMealItemInput => ({
  displayName: item.displayName,
  grams: item.grams,
  foodSource: item.foodSource,
  foodRef: item.foodRef,
  origin: item.origin,
  confidenceFood: item.confidenceFood,
  confidencePortion: item.confidencePortion,
  nutrients: itemNutrients(item),
});

/** A meal as a save request, with the snapshots it already has: to copy it (FR-33) or to put it back after a delete. */
export function mealToSaveInput(meal: MealWithItems, overrides: Partial<Pick<SaveMealInput, 'eatenAt' | 'source'>> = {}): SaveMealInput {
  return {
    eatenAt: overrides.eatenAt ?? new Date(meal.eatenAt),
    slot: meal.slot,
    name: meal.name,
    source: overrides.source ?? meal.source,
    scanId: meal.scanId,
    photoPath: meal.photoPath,
    note: meal.note,
    items: meal.items.map(toInput),
  };
}

/** Unit of each nutrient, as the catalog stores it (`scripts/catalog/trackedNutrients.ts`). */
export const NUTRIENT_UNITS: Record<NutrientCode, 'kcal' | 'g' | 'mg' | 'ug'> = {
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
