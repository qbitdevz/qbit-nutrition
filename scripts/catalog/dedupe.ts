import { tokenize } from '../../src/core/catalog/text';
import { cleanDescription } from './classify';
import type { CatalogSource, SourceFood } from './types';

/**
 * Which source wins when two publish the same food (docs/catalog-sources.md, "De-duplication").
 * Foundation Foods and SR Legacy hold analytical values; FNDDS values are derived from them, so FNDDS loses.
 * Foundation is newer than SR Legacy (which is frozen at 2018).
 */
export const SOURCE_PRIORITY: readonly CatalogSource[] = ['usda_foundation', 'usda_sr_legacy', 'usda_fndds', 'usda_branded', 'qbit_recipe'];

/**
 * Identity of a food across sources: the description's words, lowercased, without accents, singular, sorted.
 * "Bananas, raw" = "Banana, raw"; "Oil, coconut" = "Coconut oil". Two foods that differ by any word stay apart.
 */
export function dedupeKey(description: string): string {
  return tokenize(cleanDescription(description)).sort().join(' ');
}

export interface DedupeResult {
  /** Surviving foods, in input order. Input objects are never mutated: a survivor that gains portions is a copy. */
  kept: SourceFood[];
  /** Foods left out, with the id of the survivor that stands for them. */
  dropped: { food: SourceFood; keptId: number }[];
}

const rank = (source: CatalogSource): number => SOURCE_PRIORITY.indexOf(source);

/**
 * Across sources, keeps the food of the highest-priority source for each `dedupeKey`. Several foods of that same source
 * with one key are different entries of that source (a restaurant and a generic "Hamburger, plain") and all stay.
 * Household portions of a dropped duplicate go to a survivor that has none of its own; no nutrient value is ever
 * merged or changed.
 */
export function dedupeFoods(foods: readonly SourceFood[]): DedupeResult {
  const bestRank = new Map<string, number>();
  const firstKept = new Map<string, SourceFood>();
  for (const food of foods) {
    const key = dedupeKey(food.description);
    const r = rank(food.source);
    const best = bestRank.get(key);
    if (best === undefined || r < best) {
      bestRank.set(key, r);
      firstKept.set(key, food);
    } else if (r === best && food.fdcId < (firstKept.get(key) as SourceFood).fdcId) {
      firstKept.set(key, food);
    }
  }

  const spare = new Map<string, SourceFood['portions']>();
  const dropped: DedupeResult['dropped'] = [];
  for (const food of foods) {
    const key = dedupeKey(food.description);
    if (rank(food.source) === bestRank.get(key)) continue;
    dropped.push({ food, keptId: (firstKept.get(key) as SourceFood).fdcId });
    if (food.portions.length > 0 && !spare.has(key)) spare.set(key, food.portions);
  }

  const kept: SourceFood[] = [];
  for (const food of foods) {
    const key = dedupeKey(food.description);
    if (rank(food.source) !== bestRank.get(key)) continue;
    const inherited = food.portions.length === 0 ? spare.get(key) : undefined;
    kept.push(inherited ? { ...food, portions: inherited } : food);
  }
  return { kept, dropped };
}
