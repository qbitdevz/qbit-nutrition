import type { NutrientCode } from '@/core/nutrition';
import type { MealWithItems } from '@/data';
import type { HealthNutrientField, HealthNutritionRecord } from '@/platform/healthPlatform';
import { itemNutrients, NUTRIENT_UNITS } from '../meals/mealData';

/** Which Health Connect nutrition field each tracked nutrient (other than energy) is written to. */
export const FIELD_OF: Record<Exclude<NutrientCode, 'kcal'>, HealthNutrientField> = {
  protein: 'protein',
  carbs: 'totalCarbohydrate',
  fat: 'totalFat',
  fiber: 'dietaryFiber',
  sugars: 'sugar',
  sat_fat: 'saturatedFat',
  sodium: 'sodium',
  potassium: 'potassium',
  calcium: 'calcium',
  iron: 'iron',
  magnesium: 'magnesium',
  zinc: 'zinc',
  vit_a: 'vitaminA',
  vit_c: 'vitaminC',
  vit_d: 'vitaminD',
  vit_b12: 'vitaminB12',
  folate: 'folate',
};

const ONE_MINUTE_MS = 60_000;
const NAME_LIMIT = 200;

const toGrams = (value: number, unit: 'g' | 'mg' | 'ug'): number => (unit === 'g' ? value : unit === 'mg' ? value / 1_000 : value / 1_000_000);

/**
 * The nutrition record of a saved meal (docs/09 section 2.7): the meal id is the client record id, the record ends when the meal
 * was eaten, energy is the sum of its items, and each tracked nutrient is the sum of its items converted to grams.
 *
 * A nutrient that only some of the items report is left out, not written as a smaller number: the meal screen marks such a total
 * as incomplete, and another app would show it as a fact. The four headline values every item has are always written.
 */
export function nutritionRecordForMeal(meal: MealWithItems): HealthNutritionRecord {
  const amounts = meal.items.map(itemNutrients);
  const grams: HealthNutritionRecord['grams'] = {};
  for (const [code, field] of Object.entries(FIELD_OF) as [Exclude<NutrientCode, 'kcal'>, HealthNutrientField][]) {
    const reported = amounts.filter((a) => a[code] !== undefined && Number.isFinite(a[code]) && (a[code] ?? 0) >= 0);
    if (reported.length === 0 || reported.length < amounts.length) continue;
    grams[field] = toGrams(
      reported.reduce((sum, a) => sum + (a[code] ?? 0), 0),
      NUTRIENT_UNITS[code] as 'g' | 'mg' | 'ug',
    );
  }
  const endTime = new Date(meal.eatenAt);
  const name = (meal.name?.trim() || meal.items.map((i) => i.displayName).join(', ')).slice(0, NAME_LIMIT);
  return {
    clientRecordId: meal.id,
    clientRecordVersion: Date.parse(meal.updatedAt),
    startTime: new Date(endTime.getTime() - ONE_MINUTE_MS).toISOString(),
    endTime: endTime.toISOString(),
    mealType: meal.slot,
    ...(name ? { name } : {}),
    energyKcal: amounts.reduce((sum, a) => sum + (a.kcal ?? 0), 0),
    grams,
  };
}
