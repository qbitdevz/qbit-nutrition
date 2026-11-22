import { DEFAULT_MATCH_THRESHOLD, createNameScorer, type Catalog, type FoodSummary, type MatchInput, type MatchResult } from '@/core/catalog';
import type { ImportedFoodHit, ImportedFoodRepository } from '@/data';
import { importedRef } from './importedSearch';

const CANDIDATES = 40;

function summaryOf(hit: ImportedFoodHit): FoodSummary {
  return {
    ref: importedRef(hit),
    name: hit.name,
    category: hit.group,
    state: 'unknown',
    isBranded: false,
    kcal100g: hit.per100g.kcal ?? null,
    protein100g: hit.per100g.protein ?? null,
    carbs100g: hit.per100g.carbs ?? null,
    fat100g: hit.per100g.fat ?? null,
  };
}

/**
 * The AI scan's matcher with the person's imported tables added (S1: imported foods "match like any food"). The catalog matches first,
 * exactly as before. An imported food replaces its result only when:
 *   - the person has not confirmed a match for this name before (a learned correction, kind `memory`, always stays: it is theirs), and
 *   - the imported food scores at least the match threshold, and
 *   - it scores STRICTLY higher than the best catalog candidate. On a tie the catalog keeps the match.
 * Imported foods are scored with the catalog's own rules (`createNameScorer`), so the scores compare. A nutrient the table does not
 * have stays unknown on the item, like any other food.
 */
export function withImportedMatching(catalog: Catalog, imported: Pick<ImportedFoodRepository, 'search'>, threshold = DEFAULT_MATCH_THRESHOLD): Catalog {
  return {
    ...catalog,
    async match(items: readonly MatchInput[], locale) {
      const results = await catalog.match(items, locale);
      return Promise.all(
        results.map(async (result, index): Promise<MatchResult> => {
          const item = items[index];
          if (!item || result.kind === 'memory') return result;
          const queries = [...new Set([item.canonical_name_en, item.name, ...item.search_terms_en].filter((q) => q.trim() !== ''))];
          const found = new Map<string, ImportedFoodHit>();
          for (const query of queries) for (const hit of (await imported.search(query, CANDIDATES)).slice(0, CANDIDATES)) found.set(hit.id, hit);
          if (found.size === 0) return result;

          const score = createNameScorer(item.canonical_name_en, { prefixLastToken: false, searchTerms: [item.name, ...item.search_terms_en] });
          let best: { hit: ImportedFoodHit; score: number } | null = null;
          for (const hit of found.values()) {
            const s = score(hit.name);
            if (!best || s > best.score || (s === best.score && hit.name.length < best.hit.name.length)) best = { hit, score: s };
          }
          const catalogScore = result.kind === 'catalog' ? result.score : 0;
          if (!best || best.score < threshold || best.score <= catalogScore) return result;
          return { kind: 'catalog', ref: importedRef(best.hit), food: summaryOf(best.hit), score: best.score, needsReview: false, alternatives: result.alternatives };
        }),
      );
    },
  };
}
