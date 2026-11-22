import { eq } from 'drizzle-orm';
import { CatalogError, type Catalog, type FoodRef } from '../../core/catalog';
import type { FoodNutrition, NutrientAmounts } from '../../core/nutrition';
import { barcodeProduct, customFood } from '../schema';
import { toCustomFood } from './customFoods';
import type { RepositoryContext } from './shared';

/**
 * Finds the per-100 g values of the food an item came from, or null when it no longer exists
 * (a deleted custom food, a catalog entry dropped by a catalog update).
 */
export type FoodResolver = (ref: FoodRef) => Promise<FoodNutrition | null>;

export function createFoodResolver(
  { db }: Pick<RepositoryContext, 'db'>,
  catalog: Pick<Catalog, 'getFood'>,
): FoodResolver {
  return async (ref) => {
    switch (ref.source) {
      case 'catalog':
        try {
          return await catalog.getFood(ref);
        } catch (error) {
          if (error instanceof CatalogError && error.code === 'not_found') return null;
          throw error;
        }
      case 'custom': {
        const row = db.select().from(customFood).where(eq(customFood.id, ref.id)).get();
        return row ? toCustomFood(row) : null;
      }
      case 'barcode': {
        const row = db.select().from(barcodeProduct).where(eq(barcodeProduct.barcode, ref.id)).get();
        if (!row) return null;
        const other = row.otherNutrientsJson ? (JSON.parse(row.otherNutrientsJson) as NutrientAmounts) : {};
        return {
          per100g: { kcal: row.kcal100g, protein: row.protein100g, carbs: row.carbs100g, fat: row.fat100g, ...other },
        };
      }
    }
  };
}
