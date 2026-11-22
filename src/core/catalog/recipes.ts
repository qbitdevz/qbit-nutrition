import type { NutrientCode } from '../nutrition/types';
import type { FoodRef } from './types';

/**
 * Recipe-calculated foods (odd/tasks/catalog-expansion.md T4, S7, S8): dishes the project calculated from documented
 * recipes and the ingredient values of the catalog (docs/catalog-recipes.md). They live in `catalog.db` like any food, with
 * `food.source = 'qbit_recipe'` and an id in the range reserved here, so that an id alone tells where a value came from
 * (a saved meal item keeps only `food_source = 'catalog'` and the id).
 */
export const RECIPE_ID_BASE = 900_000_000;

/** True when the food is a recipe-calculated dish: a catalog food with an id from `RECIPE_ID_BASE` up. FDC ids are far below it. */
export function isRecipeRef(ref: FoodRef): boolean {
  if (ref.source !== 'catalog' || !/^\d+$/.test(ref.id)) return false;
  return Number(ref.id) >= RECIPE_ID_BASE;
}

export interface RecipeIngredientView {
  /** Name in the requested language (the English one when the catalog has no translation). */
  name: string;
  /** Grams used in the recipe, before cooking. */
  grams: number;
  /** Cooked weight as a percentage of the weight used, when a published yield was applied to it. */
  yieldPercent: number | null;
  /** Fat taken up in frying: an assumption of the recipe, not a catalog value. */
  absorbed: boolean;
}

/** How a recipe-calculated food was made: what the person reads under "Calculated from a recipe". */
export interface RecipeDetail {
  ref: FoodRef;
  /** The recipe set the dish belongs to (`catalog_meta.recipe_set_version`). */
  version: string;
  preparation: string;
  /** Where the proportions come from, with the assumptions made (cut, breading, oil absorbed). */
  basis: string;
  /** Grams of ingredients, and the weight of the finished dish. */
  rawGrams: number;
  finalGrams: number;
  ingredients: RecipeIngredientView[];
  /** The published tables the yields and retention factors come from, as printed in the catalog. */
  factorSources: string[];
  /** Nutrients the dish does not report because an ingredient lacked them. */
  unknownNutrients: NutrientCode[];
}
