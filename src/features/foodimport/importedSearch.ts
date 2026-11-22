import { createNameScorer, type FoodRef, type ScoredFood } from '@/core/catalog';
import type { ImportedFoodHit, ImportedFoodRepository } from '@/data';

/**
 * How imported foods and catalog foods share one result list (S1, S5). The rule, pinned by tests:
 *
 * 1. Imported candidates are scored with the catalog's own rules (`createNameScorer`), so a score means the same thing on both sides.
 * 2. At most `IMPORTED_RESULT_LIMIT` imported foods (the best scoring) take part, however many thousands the person imported; the
 *    catalog's own limit applies to the catalog. Neither list is cut to make room for the other, so neither can bury the other.
 * 3. The two lists are merged by score, best first. On equal scores the catalog food comes first: it is the reviewed reference, and a
 *    person who imported a table does not get their own copy of "Banana" ahead of it. An exact imported match still beats a loose
 *    catalog one, because it scores higher.
 * 4. The person's own custom foods stay first, as before; favorites and recents keep ranking above other matches (the screen's rule).
 */
export const IMPORTED_RESULT_LIMIT = 15;

export interface ScoredImported {
  hit: ImportedFoodHit;
  score: number;
}

export const importedRef = (hit: Pick<ImportedFoodHit, 'id'>): FoodRef => ({ source: 'custom', id: hit.id });

/** The best imported foods for a typed query, scored on the catalog's scale. */
export async function searchImportedScored(repo: Pick<ImportedFoodRepository, 'search'>, query: string, limit = IMPORTED_RESULT_LIMIT): Promise<ScoredImported[]> {
  const candidates = await repo.search(query, limit);
  if (candidates.length === 0) return [];
  const score = createNameScorer(query);
  return candidates
    .map((hit) => ({ hit, score: score(hit.name) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.hit.name.length - b.hit.name.length || a.hit.name.localeCompare(b.hit.name))
    .slice(0, limit);
}

/** Catalog and imported results merged by score; a tie goes to the catalog (rule 3). */
export function mergeByScore<C extends { score: number }, I extends { score: number }>(catalog: readonly C[], imported: readonly I[]): ((C & { from: 'catalog' }) | (I & { from: 'imported' }))[] {
  const tagged = [
    ...catalog.map((c) => ({ ...c, from: 'catalog' as const })),
    ...imported.map((i) => ({ ...i, from: 'imported' as const })),
  ];
  // Array.prototype.sort is stable: equal scores keep catalog first, and each list keeps its own order.
  return tagged.sort((a, b) => b.score - a.score);
}

export type { ScoredFood };
