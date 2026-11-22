/// <reference types="node" />
/**
 * Builds catalog-build/catalog.db from USDA FoodData Central Foundation Foods and SR Legacy
 * (both CC0). Run with: npx tsx scripts/catalog/build.ts
 *
 * Downloads are cached in catalog-build/downloads/, so the script can be re-run (offline too,
 * once the files are cached). Output: catalog-build/catalog.db (git-ignored).
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { buildCatalog } from './builder';
import { loadFactors, loadRecipes, resolveRecipes } from './recipes';
import { loadRegional } from './regionalFoods';
import { loadPortionGlossary, loadAliasRules, loadGlossary, loadSynonyms, loadTranslations } from './translations';
import type { SourceFood } from './types';
import {
  ensureDownloaded,
  fetchDatasetFiles,
  findCachedDatasetFiles,
  parseUsdaJson,
  readZipJsonEntry,
  type DatasetFile,
} from './usda';

const ROOT = path.resolve(__dirname, '../..');
const BUILD_DIR = path.join(ROOT, 'catalog-build');
const DOWNLOAD_DIR = path.join(BUILD_DIR, 'downloads');
const OUT_PATH = path.join(BUILD_DIR, 'catalog.db');
const DATA_DIR = path.join(__dirname, 'data');
const TRANSLATIONS_PATH = path.join(DATA_DIR, 'translations.es.json');

async function resolveFiles(): Promise<DatasetFile[]> {
  try {
    return await fetchDatasetFiles();
  } catch (err) {
    const cached = findCachedDatasetFiles(DOWNLOAD_DIR);
    if (!cached) throw err;
    console.warn(`Could not read the download page (${(err as Error).message}); using cached files.`);
    return cached;
  }
}

/** Downloads (or reads from the cache) and parses every source data set. */
export async function loadSourceFoods(): Promise<{ foods: SourceFood[]; files: DatasetFile[] }> {
  const files = await resolveFiles();
  const foods: SourceFood[] = [];
  for (const file of files) {
    console.log(`${file.source}: ${file.fileName}`);
    const zipPath = await ensureDownloaded(file, DOWNLOAD_DIR);
    const json = readZipJsonEntry(readFileSync(zipPath)).toString('utf8');
    const parsed = parseUsdaJson(file.source, json);
    console.log(`  ${parsed.length} foods read`);
    for (const f of parsed) foods.push(f);
  }
  return { foods, files };
}

async function main(): Promise<void> {
  const { foods, files } = await loadSourceFoods();

  // The reviewed regional selection from Branded Foods: a committed snapshot, so the build never needs the 3 GB file.
  const regional = loadRegional(path.join(DATA_DIR, 'regional-foods.json'));
  const sourceFoods = [...foods, ...regional.foods];

  // The project's own dishes: calculated from recipes and the ingredient values above (docs/catalog-recipes.md). A recipe whose
  // ingredient is missing stops the build here, with the recipe and the ingredient named.
  const recipeSet = loadRecipes(path.join(DATA_DIR, 'recipes'));
  const recipes = resolveRecipes(recipeSet.recipes, sourceFoods, loadFactors(path.join(DATA_DIR, 'factors')), recipeSet.version);
  console.log(`recipes: ${recipes.length} dishes calculated (set ${recipeSet.version})`);

  const counts = buildCatalog({
    foods: sourceFoods,
    recipes,
    recipeSetVersion: recipeSet.version,
    translations: [...loadTranslations(TRANSLATIONS_PATH), ...regional.translations],
    glossary: loadGlossary(path.join(DATA_DIR, 'glossary')),
    portionGlossary: loadPortionGlossary(DATA_DIR),
    synonyms: loadSynonyms(path.join(DATA_DIR, 'synonyms.json')),
    aliasRules: [...loadAliasRules(path.join(DATA_DIR, 'aliases.json')), ...regional.aliasRules],
    outPath: OUT_PATH,
    meta: {
      dataVersion: files.map((f) => `${f.source}@${f.version}`).join('+'),
      buildDate: new Date().toISOString(),
      sourceFiles: files.map((f) => f.fileName),
    },
  });

  console.log(`Wrote ${OUT_PATH} (${(statSync(OUT_PATH).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(counts);
  if (counts.unmatchedTranslations.length > 0) {
    console.warn(`Translations that matched no USDA description: ${counts.unmatchedTranslations.join('; ')}`);
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
