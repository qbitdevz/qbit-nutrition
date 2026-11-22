/// <reference types="node" />
/**
 * Which foods get a reviewed Spanish name (`data/translations.es.json`), by a reproducible criterion (docs/catalog-translation-sample.md):
 *
 *  1. every food that a search puts in the top 3 and that the everyday query set accepts, for each query of
 *     src/core/catalog/testing/searchQueries.ts (the foods people reach first); and
 *  2. the plain staples of every food group: in each USDA/WWEIA category, the K generic (non-branded) foods, everyday FNDDS
 *     foods before Foundation before SR Legacy, then the shortest English description, K = 5 for the 60 largest categories and 3 for the others.
 *
 * Prints a tab-separated list (id, English, composed Spanish, reason) to stdout; counts to stderr.
 *   npx tsx scripts/catalog/handwrittenSelection.ts > catalog-build/handwritten-candidates.tsv
 */
import path from 'node:path';
import { createCatalog } from '../../src/core/catalog';
import { accepts, indexFoods } from '../../src/core/catalog/testing/searchHarness';
import { SEARCH_CASES } from '../../src/core/catalog/testing/searchQueries';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from './nodeSqlitePort';

export interface Candidate {
  id: string;
  en: string;
  es: string;
  reason: string;
}

export async function selectCandidates(dbFile: string): Promise<Candidate[]> {
  const db = new NodeSqliteCatalogDb(dbFile);
  const index = await indexFoods(db);
  const catalog = createCatalog({ db, memory: new InMemoryMatchMemory() });
  const picked = new Map<string, string>();
  for (const c of SEARCH_CASES) {
    for (const hit of await catalog.search(c.q, c.locale, 3)) {
      const f = index.get(hit.ref.id);
      if (f && accepts(c.accept, f) && !picked.has(f.id)) picked.set(f.id, `query: ${c.q}`);
    }
  }
  const rows = await db.all(
    `SELECT f.id AS id, f.category AS category, f.source AS source, e.name AS en FROM food f
       JOIN food_name e ON e.food_id = f.id AND e.locale = 'en' AND e.is_alias = 0 WHERE f.is_branded = 0 AND f.category IS NOT NULL`,
  );
  // Everyday foods as eaten (FNDDS, built from what people report eating) come before analytical entries of rare foods.
  const rank = (source: string): number => (source === 'usda_fndds' ? 0 : source === 'usda_foundation' ? 1 : 2);
  const byCategory = new Map<string, { id: string; en: string; rank: number }[]>();
  for (const r of rows) byCategory.set(String(r.category), [...(byCategory.get(String(r.category)) ?? []), { id: String(r.id), en: String(r.en), rank: rank(String(r.source)) }]);
  const largest = new Set([...byCategory].sort((a, b) => b[1].length - a[1].length).slice(0, 60).map(([k]) => k));
  for (const [category, foods] of byCategory) {
    const k = largest.has(category) ? 5 : 3;
    foods.sort((a, b) => a.rank - b.rank || a.en.length - b.en.length || a.en.localeCompare(b.en));
    for (const f of foods.slice(0, k)) if (!picked.has(f.id)) picked.set(f.id, `group: ${category}`);
  }
  const names = await db.all(`SELECT food_id AS id, name FROM food_name WHERE locale = 'es' AND is_alias = 0`);
  const es = new Map(names.map((n) => [String(n.id), String(n.name)]));
  const out = [...picked].map(([id, reason]) => ({ id, en: (index.get(id) as { en: string }).en, es: es.get(id) ?? '', reason }));
  db.close();
  return out.sort((a, b) => Number(a.id) - Number(b.id));
}

if (require.main === module) {
  selectCandidates(path.resolve(__dirname, '../../catalog-build/catalog.db')).then((list) => {
    for (const c of list) console.log([c.id, c.en, c.es, c.reason].join('\t'));
    console.error(`${list.length} candidates (${list.filter((c) => c.reason.startsWith('query')).length} from queries)`);
  });
}
