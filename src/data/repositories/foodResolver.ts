import { eq } from 'drizzle-orm';
import { CatalogError, type Catalog, type FoodRef } from '../../core/catalog';
import type { FoodNutrition } from '../../core/nutrition';
import { barcodeProduct, customFood } from '../schema';
import { barcodePer100g, toBarcodeRecord } from './barcodeProducts';
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
        // A product whose headline values the lookup did not have has nothing to recalculate from (and nothing is invented
        // for it): the item is then scaled from its own snapshot, like an AI estimate.
        const { missing } = toBarcodeRecord(row);
        if (missing.some((field) => field !== 'name')) return null;
        return { per100g: barcodePer100g(row, missing) };
      }
    }
  };
}
