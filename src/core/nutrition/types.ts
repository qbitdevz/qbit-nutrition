/**
 * Tracked nutrients (docs/02-prd.md section 3). Codes are the `nutrient.code` values of
 * `catalog.db` and the `nutrient_code` values of `meal_item_nutrient`.
 */
export const NUTRIENT_CODES = [
  'kcal',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sugars',
  'sat_fat',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'magnesium',
  'zinc',
  'vit_a',
  'vit_c',
  'vit_d',
  'vit_b12',
  'folate',
] as const;

export type NutrientCode = (typeof NUTRIENT_CODES)[number];

/** Amounts in each nutrient's own unit. A missing key means "not reported", never zero. */
export type NutrientAmounts = Partial<Record<NutrientCode, number>>;

/** The part of a food the nutrition core needs; `FoodDetail` in core/catalog satisfies it. */
export interface FoodNutrition {
  per100g: NutrientAmounts;
}

export type Unit = 'g' | 'mg' | 'ug' | 'kg' | 'oz' | 'lb' | 'kcal' | 'kj' | 'ml' | 'l';
