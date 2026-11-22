/// <reference types="node" />
/**
 * Measures top-1 and top-3 accuracy of catalog search over the everyday query set
 * (src/core/catalog/testing/searchQueries.ts) against catalog-build/catalog.db.
 *   npx tsx scripts/catalog/searchAccuracy.ts [--failures]
 */
import path from 'node:path';
import { createCatalog } from '../../src/core/catalog';
import { indexFoods, measure, unsatisfiable } from '../../src/core/catalog/testing/searchHarness';
import { SEARCH_CASES } from '../../src/core/catalog/testing/searchQueries';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from './nodeSqlitePort';

async function main(): Promise<void> {
  const db = new NodeSqliteCatalogDb(path.resolve(__dirname, '../../catalog-build/catalog.db'));
  const index = await indexFoods(db);
  const bad = unsatisfiable(index, SEARCH_CASES);
  if (bad.length > 0) console.log(`UNSATISFIABLE (fix the case): ${bad.map((c) => `${c.locale}:${c.q}`).join(', ')}`);
  const catalog = createCatalog({ db, memory: new InMemoryMatchMemory() });
  const acc = await measure(catalog, index, SEARCH_CASES);
  const by = (loc: string) => acc.results.filter((r) => r.case.locale === loc);
  const pct = (n: number, d: number) => `${n}/${d} = ${((n / d) * 100).toFixed(1)} %`;
  console.log(`cases ${acc.total} (en ${by('en').length}, es ${by('es').length})`);
  console.log(`top-1 ${pct(acc.top1, acc.total)}   top-3 ${pct(acc.top3, acc.total)}`);
  for (const loc of ['en', 'es']) {
    const r = by(loc);
    console.log(`  ${loc}: top-1 ${pct(r.filter((x) => x.rank === 1).length, r.length)}   top-3 ${pct(r.filter((x) => x.rank !== null).length, r.length)}`);
  }
  if (process.argv.includes('--failures')) {
    for (const r of acc.results.filter((x) => x.rank !== 1)) {
      console.log(`${r.rank === null ? 'MISS ' : `rank ${r.rank}`} [${r.case.locale}] ${r.case.q}${r.case.note ? ` (${r.case.note})` : ''}`);
      for (const t of r.top) console.log(`      ${t}`);
    }
  }
  db.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
