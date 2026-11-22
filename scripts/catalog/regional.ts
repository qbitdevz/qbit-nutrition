/// <reference types="node" />
/**
 * Optional build step: a small, reviewed selection of regional foods from the FoodData Central Branded Foods data set.
 *
 * The Branded file is about 196 MB zipped and 3 GB of JSON, so it is never downloaded by `npm run catalog:build`. The selection
 * lives in `data/regional-foods.json` (a snapshot of the chosen foods, CC0 like all FDC data, with fdcId and source) and the
 * normal build reads only that file. To review candidates or refresh the snapshot, run (needs the zip in
 * catalog-build/downloads/, see docs/catalog-sources.md section 6):
 *
 *   npx tsx scripts/catalog/regional.ts candidates "alfajor" "yerba mate"      list matching products
 *   npx tsx scripts/catalog/regional.ts snapshot                              rewrite data/regional-foods.json from data/regional-selection.json
 */
import { existsSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { splitArrayElements, streamZipJson } from './jsonStream';
import { trackedAmounts } from './builder';
import type { SourceFood } from './types';

export interface RegionalSelection {
  /** FDC id of the Branded product whose values are used. */
  fdcId: number;
  /** Generic English description: a brand is never part of the name. */
  en: string;
  /** Generic neutral-Spanish name. */
  es: string;
  aliasesEs?: string[];
  aliasesEn?: string[];
  /** English label of the label serving, in household words ("1 alfajor"); the grams come from the data. Without it no portion is kept. */
  portionLabel?: string;
}

interface BrandedFood {
  fdcId: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  brandedFoodCategory?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: { nutrient?: { id?: number; unitName?: string }; amount?: number }[];
}

/** What the snapshot keeps of a Branded product: tracked nutrients per 100 g and the label serving, nothing else. */
export function toSourceFood(f: BrandedFood, sel: RegionalSelection): SourceFood {
  const portions: SourceFood['portions'] = [];
  const grams = f.servingSizeUnit?.toLowerCase().startsWith('g') ? f.servingSize : undefined;
  if (grams && grams > 0 && sel.portionLabel) portions.push({ label: sel.portionLabel, grams });
  return {
    source: 'usda_branded',
    fdcId: f.fdcId,
    description: sel.en,
    category: f.brandedFoodCategory ?? null,
    nutrients: (f.foodNutrients ?? []).flatMap((n) =>
      n.nutrient?.id !== undefined && typeof n.amount === 'number' ? [{ id: n.nutrient.id, unit: n.nutrient.unitName ?? '', amount: n.amount }] : [],
    ),
    portions,
  };
}

async function scan(zip: string, keep: (f: BrandedFood) => boolean): Promise<BrandedFood[]> {
  const out: BrandedFood[] = [];
  for await (const text of splitArrayElements(streamZipJson(zip))) {
    // Cheap pre-filter on the raw text, then a real parse of the few survivors.
    const f = JSON.parse(text) as BrandedFood;
    if (keep(f)) out.push(f);
  }
  return out;
}

function findZip(dir: string): string {
  const hit = existsSync(dir) ? readdirSync(dir).filter((n) => /^FoodData_Central_branded_food_json_.*\.zip$/.test(n)).sort().pop() : undefined;
  if (!hit) throw new Error(`No FoodData_Central_branded_food_json_*.zip in ${dir}; download it first (docs/catalog-sources.md section 6)`);
  return path.join(dir, hit);
}

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '../..');
  const zip = findZip(path.join(root, 'catalog-build', 'downloads'));
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'candidates') {
    const res = args.map((a) => new RegExp(a, 'i'));
    const hits = await scan(zip, (f) => res.some((r) => r.test(f.description ?? '')));
    for (const f of hits) {
      const kcal = f.foodNutrients?.find((n) => n.nutrient?.id === 1008)?.amount;
      console.log([f.fdcId, f.description, f.brandName ?? f.brandOwner, f.brandedFoodCategory, `kcal ${kcal}`, `${f.servingSize}${f.servingSizeUnit} ${f.householdServingFullText ?? ''}`].join(' | '));
    }
    console.error(`${hits.length} products`);
  } else if (cmd === 'snapshot') {
    const selection = JSON.parse(readFileSync(path.join(__dirname, 'data', 'regional-selection.json'), 'utf8')) as RegionalSelection[];
    const ids = new Set(selection.map((s) => s.fdcId));
    const found = await scan(zip, (f) => ids.has(f.fdcId));
    const foods = selection.map((s) => {
      const f = found.find((x) => x.fdcId === s.fdcId);
      if (!f) throw new Error(`fdcId ${s.fdcId} (${s.en}) is not in ${path.basename(zip)}`);
      const food = toSourceFood(f, s);
      if (Object.keys(trackedAmounts(food)).length === 0) throw new Error(`fdcId ${s.fdcId} has no tracked nutrient`);
      return { ...food, es: s.es, aliasesEs: s.aliasesEs ?? [], aliasesEn: s.aliasesEn ?? [], dataFile: path.basename(zip) };
    });
    writeFileSync(path.join(__dirname, 'data', 'regional-foods.json'), `${JSON.stringify(foods, null, 2)}\n`);
    console.log(`Wrote ${foods.length} foods to data/regional-foods.json from ${path.basename(zip)}`);
  } else console.error('usage: regional.ts candidates <regex...> | snapshot');
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
