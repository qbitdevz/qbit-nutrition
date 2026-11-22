/// <reference types="node" />
/**
 * Maintainer tool: prints the top-ranked catalog foods and their scores for queries, through the matcher.
 *   npx tsx scripts/catalog/rankProbe.ts "french fries" "steamed broccoli" ...
 */
import path from 'node:path';
import { createCatalog, type Preparation } from '../../src/core/catalog';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from './nodeSqlitePort';

async function main(): Promise<void> {
  const db = new NodeSqliteCatalogDb(path.resolve(__dirname, '../../catalog-build/catalog.db'));
  const catalog = createCatalog({ db, memory: new InMemoryMatchMemory() });
  for (const q of process.argv.slice(2)) {
    const prep = (q.match(/^(\w+):(.*)$/)?.[1] ?? 'unknown') as Preparation;
    const text = q.replace(/^\w+:/, '');
    const [r] = await catalog.match([{ name: text, canonical_name_en: text, search_terms_en: [], preparation: prep }], 'en');
    console.log(`## ${q}`);
    for (const a of r?.alternatives ?? []) console.log(`  ${a.score.toFixed(3)} ${a.food.state.padEnd(9)} ${a.food.name}`);
    const hits = await catalog.search(text, 'en', 5);
    console.log(`  search: ${hits.map((h) => h.name).join(' | ')}`);
  }
  db.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
