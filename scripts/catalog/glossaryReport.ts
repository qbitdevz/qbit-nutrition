/// <reference types="node" />
/**
 * Lists the English words that the Spanish glossary does not cover yet, most frequent first, with one example
 * description each. Maintainer tool for `scripts/catalog/data/glossary/`; the build fails while this list is not empty.
 *
 *   npx tsx scripts/catalog/glossaryReport.ts [--all]    (--all: also print the tokens' counts of covered words' total)
 */
import path from 'node:path';
import { loadSourceFoods } from './build';
import { composeSpanish } from './compose';
import { cleanDescription } from './classify';
import { dedupeFoods } from './dedupe';
import { loadGlossary, loadTranslations } from './translations';

async function main(): Promise<void> {
  const { foods } = await loadSourceFoods();
  const glossary = loadGlossary(path.join(__dirname, 'data', 'glossary'));
  const handwritten = new Set(loadTranslations(path.join(__dirname, 'data', 'translations.es.json')).map((t) => t.en.toLowerCase()));
  const counts = new Map<string, { n: number; example: string }>();
  let composed = 0;
  for (const food of dedupeFoods(foods).kept) {
    const description = cleanDescription(food.description);
    if (handwritten.has(description.toLowerCase())) continue;
    composed++;
    for (const w of composeSpanish(description, glossary).missing) {
      const c = counts.get(w) ?? { n: 0, example: description };
      c.n++;
      counts.set(w, c);
    }
  }
  const rows = [...counts].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  for (const [w, c] of rows) console.log(`${w}\t${c.n}\t${c.example}`);
  console.error(`${composed} foods to compose, ${rows.length} words missing`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
