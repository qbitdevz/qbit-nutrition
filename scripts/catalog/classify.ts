import type { FoodState } from '../../src/core/catalog/types';
import type { SourceFood } from './types';

const RAW = /\b(raw|unprepared|uncooked)\b/i;
const COOKED =
  /\b(cooked|boiled|steamed|grilled|broiled|baked|roasted|fried|pan-fried|deep-fried|stewed|braised|sauteed|simmered|poached|toasted|microwaved|scrambled|pan-broiled)\b/i;
const PROCESSED =
  /\b(canned|dried|dehydrated|frozen|pickled|smoked|cured|powder|powdered|instant|concentrate|prepared|ready-to-eat|ready-to-heat|ready-to-drink|bottled|juice|jelly|jam|sauce|sweetened)\b/i;

/** FNDDS writes "Lentils, from dried, ..." for the food as eaten, i.e. cooked from the dry product. */
const COOKED_FROM = /\bfrom (dried|raw|fresh)\b/i;

/**
 * WWEIA categories (FNDDS) whose foods are dishes, sandwiches or soups: foods as eaten, so "cooked" even when the
 * description has no cooking word ("Empanada, beef").
 */
const DISH_CATEGORIES = new Set([
  'Burritos and tacos', 'Other Mexican mixed dishes', 'Nachos', 'Turnovers and other grain-based items', 'Pizza',
  'Meat mixed dishes', 'Poultry mixed dishes', 'Seafood mixed dishes', 'Rice mixed dishes', 'Fried rice and lo/chow mein',
  'Pasta mixed dishes, excludes macaroni and cheese', 'Macaroni and cheese', 'Egg rolls, dumplings, sushi',
  'Bean, pea, legume dishes', 'Vegetable dishes', 'Soups, broth-based', 'Soups, cream-based', 'Ramen and Asian broth-based soups',
  'Burgers', 'Chicken fillet sandwiches', 'Deli and cured meat sandwiches', 'Meat and BBQ sandwiches', 'Seafood sandwiches',
  'Frankfurter sandwiches', 'Egg/breakfast sandwiches', 'Cheese sandwiches', 'Vegetable sandwiches/burgers',
  'Peanut butter and jelly sandwiches', 'Eggs and omelets', 'Stir-fry and soy-based sauce mixtures', 'Fried vegetables',
  'Chicken patties, nuggets and tenders', 'Pancakes, waffles, French toast',
]);

/**
 * Raw / cooked / processed, read from the USDA description (and, for FNDDS, its WWEIA category).
 * A cooking word beats "raw" ("Apples, raw, ..., boiled").
 */
export function deriveState(description: string, category: string | null = null): FoodState {
  if (COOKED.test(description) || COOKED_FROM.test(description)) return 'cooked';
  if (RAW.test(description)) return 'raw';
  if (PROCESSED.test(description)) return 'processed';
  if (category !== null && DISH_CATEGORIES.has(category)) return 'cooked';
  return 'unknown';
}

const BRANDED_CATEGORIES = new Set(['Fast Foods', 'Restaurant Foods']);
const ALLCAPS_ALLOWED = new Set(['USDA', 'USA', 'BBQ', 'NFS', 'RTE', 'UPC', 'DHA', 'ARA', 'MSG']);
/** Brand names SR Legacy writes in ordinary capitalization. */
const BRANDS =
  /\b(Pillsbury|Kraft|Kellogg'?s?|Nabisco|Campbell'?s?|Gerber|Nestle|General Mills|Quaker|Heinz|Hershey'?s?|Archway|Vitasoy|Goya|Gamesa|George Weston|Pepperidge|Oscar Mayer|Hormel|McDonalds?|Burger King|Starbucks|Slim Fast|Muscle Milk|Ritz|Doritos|Carnation|Monster|Triscuit|Wheat Thins|Fritos|Sunny D|Mountain Dew|No Fear|Red Bull|Rockstar|Fiber One|Nature Valley|Kashi|KIND|Clif|PowerBar|Snickers|South Beach Living|Tiger's Milk|Zone Perfect|Teddy Grahams|Cheez-It|Goldfish|Cheetos|Sun Chips|Chex Mix|Capri Sun|Boost|Ensure|Glucerna|Balance Original)\b/;

/** Branded or restaurant entries, which matching ranks below generic ones. */
export function isBranded(food: Pick<SourceFood, 'description' | 'category'>): boolean {
  if (food.category && BRANDED_CATEGORIES.has(food.category)) return true;
  if (BRANDS.test(food.description)) return true;
  return food.description
    .split(/[^A-Za-z']+/)
    .some((w) => /^[A-Z]{3,}$/.test(w) && !ALLCAPS_ALLOWED.has(w));
}

const DISTRIBUTION_NOTE = /\s*\(Includes foods for USDA's Food Distribution Program\)/g;

/** USDA description without annotations that only add noise to names and search. */
export function cleanDescription(description: string): string {
  return description.replace(DISTRIBUTION_NOTE, '').trim();
}
