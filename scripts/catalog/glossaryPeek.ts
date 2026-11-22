/// <reference types="node" />
/** Maintainer tool: prints composed Spanish names for a random sample (seed = 1st arg) or for the descriptions on stdin. */
import path from 'node:path';
import { loadSourceFoods } from './build';
import { composeSpanish } from './compose';
import { cleanDescription } from './classify';
import { dedupeFoods } from './dedupe';
import { loadGlossary } from './translations';

async function main(): Promise<void> {
  const seed0 = Number(process.argv[2] ?? 1);
  const count = Number(process.argv[3] ?? 60);
  const filter = process.argv[4] ? new RegExp(process.argv[4], 'i') : null;
  const { foods } = await loadSourceFoods();
  const glossary = loadGlossary(path.join(__dirname, 'data', 'glossary'));
  const list = dedupeFoods(foods).kept.map((f) => cleanDescription(f.description)).filter((d) => !filter || filter.test(d));
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < count && list.length > 0; i++) {
    const d = list[Math.floor(rnd() * list.length)] as string;
    console.error(`${d}\n   -> ${composeSpanish(d, glossary).name}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
