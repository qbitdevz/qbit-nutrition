/// <reference types="node" />
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NUTRIENT_CODES, type NutrientCode } from '../../src/core/nutrition/types';
import { cleanDescription, deriveState, isBranded } from './classify';
import { normalizeUsdaUnit, TRACKED_NUTRIENTS } from './trackedNutrients';
import type { BuildCounts, CatalogMeta, SourceFood, TranslationEntry } from './types';

export const SCHEMA_VERSION = '1';

/** docs/08-database-schema.md section 5, plus `food.is_branded` and the lookup indexes. */
const DDL = `
CREATE TABLE nutrient (
  code TEXT PRIMARY KEY,
  unit TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_es TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE food (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('usda_foundation', 'usda_sr_legacy')),
  source_id TEXT NOT NULL,
  category TEXT,
  state TEXT NOT NULL CHECK (state IN ('raw', 'cooked', 'processed', 'unknown')),
  is_branded INTEGER NOT NULL DEFAULT 0,
  kcal_100g REAL,
  protein_100g REAL,
  carbs_100g REAL,
  fat_100g REAL
);
CREATE TABLE food_nutrient (
  food_id INTEGER NOT NULL REFERENCES food(id),
  nutrient_code TEXT NOT NULL REFERENCES nutrient(code),
  amount_100g REAL NOT NULL,
  PRIMARY KEY (food_id, nutrient_code)
) WITHOUT ROWID;
CREATE TABLE food_name (
  food_id INTEGER NOT NULL REFERENCES food(id),
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  is_alias INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX food_name_food ON food_name(food_id);
CREATE TABLE food_portion (
  food_id INTEGER NOT NULL REFERENCES food(id),
  locale TEXT NOT NULL,
  label TEXT NOT NULL,
  grams REAL NOT NULL
);
CREATE INDEX food_portion_food ON food_portion(food_id);
CREATE VIRTUAL TABLE food_fts USING fts5(
  name,
  content='food_name',
  content_rowid='rowid',
  tokenize='porter unicode61 remove_diacritics 2'
);
CREATE TABLE catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export interface BuildOptions {
  foods: readonly SourceFood[];
  translations: readonly TranslationEntry[];
  outPath: string;
  meta: CatalogMeta;
}

function count(db: DatabaseSync, table: string): number {
  return Number((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);
}

/** Builds `catalog.db` at `outPath`. Writes a temp file first, so a failed run keeps the old one. */
export function buildCatalog(options: BuildOptions): BuildCounts {
  const { foods, translations, outPath, meta } = options;
  mkdirSync(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.building`;
  rmSync(tmp, { force: true }); // our own leftover from an interrupted run
  const db = new DatabaseSync(tmp);
  const unmatched = new Set(translations.map((t) => t.en.toLowerCase()));
  const byEnglish = new Map<string, TranslationEntry[]>();
  for (const t of translations) {
    const k = t.en.toLowerCase();
    byEnglish.set(k, [...(byEnglish.get(k) ?? []), t]);
  }

  try {
    db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    db.exec(DDL);
    db.exec('BEGIN');

    const insNutrient = db.prepare('INSERT INTO nutrient VALUES (?, ?, ?, ?, ?)');
    NUTRIENT_CODES.forEach((code, i) => {
      const n = TRACKED_NUTRIENTS[code];
      insNutrient.run(code, n.unit, n.nameEn, n.nameEs, i + 1);
    });

    const insFood = db.prepare('INSERT INTO food VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insFoodNutrient = db.prepare('INSERT INTO food_nutrient VALUES (?, ?, ?)');
    const insName = db.prepare('INSERT INTO food_name VALUES (?, ?, ?, ?)');
    const insPortion = db.prepare('INSERT INTO food_portion VALUES (?, ?, ?, ?)');

    for (const food of foods) {
      const amounts = trackedAmounts(food);
      if (Object.keys(amounts).length === 0) continue; // nothing we track: not useful as a catalog entry
      insFood.run(
        food.fdcId,
        food.source,
        String(food.fdcId),
        food.category,
        deriveState(food.description),
        isBranded(food) ? 1 : 0,
        amounts.kcal ?? null,
        amounts.protein ?? null,
        amounts.carbs ?? null,
        amounts.fat ?? null,
      );
      for (const code of NUTRIENT_CODES) {
        const amount = amounts[code];
        if (amount !== undefined) insFoodNutrient.run(food.fdcId, code, amount);
      }
      const description = cleanDescription(food.description);
      insName.run(food.fdcId, 'en', description, 0);
      const key = description.toLowerCase();
      for (const t of byEnglish.get(key) ?? []) {
        unmatched.delete(key);
        insName.run(food.fdcId, 'es', t.es, 0);
        for (const alias of t.aliases ?? []) insName.run(food.fdcId, 'es', alias, 1);
      }
      for (const p of food.portions) insPortion.run(food.fdcId, 'en', p.label, p.grams);
    }

    db.exec(`INSERT INTO food_fts(food_fts) VALUES ('rebuild')`);

    const insMeta = db.prepare('INSERT INTO catalog_meta VALUES (?, ?)');
    insMeta.run('data_version', meta.dataVersion);
    insMeta.run('build_date', meta.buildDate);
    insMeta.run('source_files', meta.sourceFiles.join('\n'));
    insMeta.run('schema_version', SCHEMA_VERSION);
    insMeta.run('translations_es_entries', String(translations.length));
    db.exec('COMMIT');

    db.exec(`INSERT INTO food_fts(food_fts) VALUES ('optimize')`);
    const counts: BuildCounts = {
      nutrient: count(db, 'nutrient'),
      food: count(db, 'food'),
      food_nutrient: count(db, 'food_nutrient'),
      food_name: count(db, 'food_name'),
      food_portion: count(db, 'food_portion'),
      food_fts: count(db, 'food_fts_docsize'),
      catalog_meta: count(db, 'catalog_meta'),
      unmatchedTranslations: translations.filter((t) => unmatched.has(t.en.toLowerCase())).map((t) => t.en),
    };
    db.close();
    renameSync(tmp, outPath);
    return counts;
  } catch (err) {
    try {
      db.close();
    } catch {
      // already closed
    }
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** Tracked nutrients of a food, first matching USDA id wins, units must agree. */
export function trackedAmounts(food: SourceFood): Partial<Record<NutrientCode, number>> {
  const out: Partial<Record<NutrientCode, number>> = {};
  for (const code of NUTRIENT_CODES) {
    const spec = TRACKED_NUTRIENTS[code];
    for (const id of spec.usdaIds) {
      const hit = food.nutrients.find((n) => n.id === id && normalizeUsdaUnit(n.unit) === spec.unit);
      if (hit) {
        out[code] = hit.amount;
        break;
      }
    }
  }
  return out;
}
