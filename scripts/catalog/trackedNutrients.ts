import type { NutrientCode } from '../../src/core/nutrition/types';

export interface TrackedNutrient {
  unit: 'kcal' | 'g' | 'mg' | 'ug';
  nameEn: string;
  nameEs: string;
  /** USDA FoodData Central nutrient ids, preferred first; the first one a food has wins. */
  usdaIds: number[];
}

/**
 * Tracked nutrients (docs/02-prd.md section 3), in display order. The record type makes the
 * compiler flag a code added to `NUTRIENT_CODES` but not mapped here.
 */
export const TRACKED_NUTRIENTS: Record<NutrientCode, TrackedNutrient> = {
  // 1008 Energy (kcal); Foundation Foods report Atwater energy as 2047 or 2048 instead.
  kcal: { unit: 'kcal', nameEn: 'Energy', nameEs: 'Energía', usdaIds: [1008, 2047, 2048] },
  protein: { unit: 'g', nameEn: 'Protein', nameEs: 'Proteína', usdaIds: [1003] },
  carbs: { unit: 'g', nameEn: 'Carbohydrate', nameEs: 'Carbohidratos', usdaIds: [1005] },
  fat: { unit: 'g', nameEn: 'Fat', nameEs: 'Grasa', usdaIds: [1004] },
  fiber: { unit: 'g', nameEn: 'Fiber', nameEs: 'Fibra', usdaIds: [1079] },
  // 2000 "Total Sugars" (Foundation) or 1063 "Sugars, Total" (SR Legacy).
  sugars: { unit: 'g', nameEn: 'Sugars', nameEs: 'Azúcares', usdaIds: [2000, 1063] },
  sat_fat: { unit: 'g', nameEn: 'Saturated fat', nameEs: 'Grasa saturada', usdaIds: [1258] },
  sodium: { unit: 'mg', nameEn: 'Sodium', nameEs: 'Sodio', usdaIds: [1093] },
  potassium: { unit: 'mg', nameEn: 'Potassium', nameEs: 'Potasio', usdaIds: [1092] },
  calcium: { unit: 'mg', nameEn: 'Calcium', nameEs: 'Calcio', usdaIds: [1087] },
  iron: { unit: 'mg', nameEn: 'Iron', nameEs: 'Hierro', usdaIds: [1089] },
  magnesium: { unit: 'mg', nameEn: 'Magnesium', nameEs: 'Magnesio', usdaIds: [1090] },
  zinc: { unit: 'mg', nameEn: 'Zinc', nameEs: 'Zinc', usdaIds: [1095] },
  vit_a: { unit: 'ug', nameEn: 'Vitamin A (RAE)', nameEs: 'Vitamina A (RAE)', usdaIds: [1106] },
  vit_c: { unit: 'mg', nameEn: 'Vitamin C', nameEs: 'Vitamina C', usdaIds: [1162] },
  vit_d: { unit: 'ug', nameEn: 'Vitamin D', nameEs: 'Vitamina D', usdaIds: [1114] },
  vit_b12: { unit: 'ug', nameEn: 'Vitamin B12', nameEs: 'Vitamina B12', usdaIds: [1178] },
  folate: { unit: 'ug', nameEn: 'Folate', nameEs: 'Folato', usdaIds: [1177] },
};

/** USDA reports micrograms as "µg" (or "UG" in some exports). */
export function normalizeUsdaUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  return u === 'µg' || u === 'μg' ? 'ug' : u;
}
