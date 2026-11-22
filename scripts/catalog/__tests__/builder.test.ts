/** @jest-environment node */
/// <reference types="node" />
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalog, trackedAmounts } from '../builder';
import { cleanDescription, deriveState, isBranded } from '../classify';
import { NodeSqliteCatalogDb } from '../nodeSqlitePort';
import { buildFixtureCatalog, FIXTURE_FOODS, FIXTURE_TRANSLATIONS } from '../testing/fixture';
import { loadTranslations } from '../translations';

const fixture = buildFixtureCatalog();
const open = () => new DatabaseSync(fixture.dbPath, { readOnly: true });

describe('buildCatalog', () => {
  it('creates the docs/08 section 5 tables with an FTS5 index', () => {
    const db = open();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table')").all() as { name: string }[]).map((r) => r.name);
    for (const t of ['nutrient', 'food', 'food_nutrient', 'food_name', 'food_portion', 'food_fts', 'catalog_meta']) {
      expect(names).toContain(t);
    }
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'food_fts'").get() as { sql: string }).sql;
    expect(sql).toMatch(/fts5/i);
    expect(sql).toMatch(/remove_diacritics/);
    db.close();
  });

  it('keeps foods with tracked nutrients and drops the rest', () => {
    expect(fixture.counts.food).toBe(FIXTURE_FOODS.length - 1);
    const db = open();
    expect(db.prepare('SELECT 1 FROM food WHERE id = 1012').get()).toBeUndefined();
    db.close();
  });

  it('reports counts per table, including the FTS index, and unmatched translations', () => {
    const db = open();
    const n = (t: string) => Number((db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n);
    expect(fixture.counts).toMatchObject({
      nutrient: 18,
      food: n('food'),
      food_nutrient: n('food_nutrient'),
      food_name: n('food_name'),
      food_portion: 1,
      food_fts: n('food_name'),
      catalog_meta: 5,
      unmatchedTranslations: ['Not in the data set'],
    });
    db.close();
  });

  it('writes English names, Spanish names, and Spanish aliases', () => {
    const db = open();
    const rows = db.prepare('SELECT locale, name, is_alias FROM food_name WHERE food_id = 1001 ORDER BY locale, is_alias, name').all();
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { locale: 'en', name: 'Bananas, raw', is_alias: 0 },
      { locale: 'es', name: 'Plátano, crudo', is_alias: 0 },
      { locale: 'es', name: 'banano', is_alias: 1 },
      { locale: 'es', name: 'guineo', is_alias: 1 },
    ]);
    db.close();
  });

  it('leaves a food without translation with its English name only', () => {
    const db = open();
    const rows = db.prepare("SELECT locale FROM food_name WHERE food_id = 1010").all();
    expect(rows.map((r) => ({ ...r }))).toEqual([{ locale: 'en' }]);
    db.close();
  });

  it('records the data version, build date, and source files', () => {
    const db = open();
    const meta = Object.fromEntries((db.prepare('SELECT key, value FROM catalog_meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    expect(meta).toMatchObject({
      data_version: 'fixture@1',
      build_date: '2026-01-01T00:00:00.000Z',
      source_files: 'fixture-a.zip\nfixture-b.zip',
    });
    db.close();
  });

  it('stores headline values inline, state, and the branded flag', () => {
    const db = open();
    const banana = db.prepare('SELECT * FROM food WHERE id = 1001').get() as Record<string, unknown>;
    expect(banana).toMatchObject({ source: 'usda_sr_legacy', source_id: '1001', state: 'raw', is_branded: 0, kcal_100g: 89, protein_100g: 1.09, carbs_100g: 22.84, fat_100g: 0.33 });
    expect((db.prepare('SELECT is_branded FROM food WHERE id = 1007').get() as { is_branded: number }).is_branded).toBe(1);
    db.close();
  });

  it('uses Atwater energy when kcal is missing and ignores nutrients with the wrong unit', () => {
    const db = open();
    const row = db.prepare('SELECT kcal_100g, carbs_100g FROM food WHERE id = 1011').get() as { kcal_100g: number; carbs_100g: number | null };
    expect(row.kcal_100g).toBe(400);
    expect(row.carbs_100g).toBeNull();
    // sodium was given in g (wrong unit for mg): it is not stored
    expect(db.prepare("SELECT 1 FROM food_nutrient WHERE food_id = 1011 AND nutrient_code = 'sodium'").get()).toBeUndefined();
    db.close();
  });

  it('is re-runnable: a second build over the same file succeeds and leaves no temp file', () => {
    const again = buildCatalog({
      foods: FIXTURE_FOODS,
      translations: FIXTURE_TRANSLATIONS,
      outPath: fixture.dbPath,
      meta: { dataVersion: 'fixture@2', buildDate: '2026-02-01T00:00:00.000Z', sourceFiles: ['x.zip'] },
    });
    expect(again.food).toBe(fixture.counts.food);
    expect(readdirSync(path.dirname(fixture.dbPath))).toEqual(['catalog.db']);
    const db = open();
    expect((db.prepare("SELECT value FROM catalog_meta WHERE key = 'data_version'").get() as { value: string }).value).toBe('fixture@2');
    db.close();
  });

  it('keeps the previous catalog when a build fails', () => {
    const bad = [{ ...FIXTURE_FOODS[0]!, source: 'not_a_source' as never }];
    expect(() => buildCatalog({ foods: bad, translations: [], outPath: fixture.dbPath, meta: { dataVersion: 'bad', buildDate: 'x', sourceFiles: [] } })).toThrow();
    expect(existsSync(`${fixture.dbPath}.building`)).toBe(false);
    const db = open();
    expect((db.prepare("SELECT value FROM catalog_meta WHERE key = 'data_version'").get() as { value: string }).value).toBe('fixture@2');
    db.close();
  });
});

describe('NodeSqliteCatalogDb', () => {
  it('answers plain rows and is read-only', async () => {
    const port = new NodeSqliteCatalogDb(fixture.dbPath);
    const rows = await port.all('SELECT id FROM food WHERE id = ?', [1001]);
    expect(rows).toEqual([{ id: 1001 }]);
    await expect(port.all('DELETE FROM food')).rejects.toThrow();
    port.close();
  });
});

describe('trackedAmounts', () => {
  it('picks the first matching USDA id with the right unit', () => {
    const out = trackedAmounts({
      source: 'usda_foundation',
      fdcId: 1,
      description: 'x',
      category: null,
      portions: [],
      nutrients: [
        { id: 2000, unit: 'g', amount: 5 },
        { id: 1063, unit: 'g', amount: 9 },
        { id: 1114, unit: 'µg', amount: 2.5 },
      ],
    });
    expect(out).toEqual({ sugars: 5, vit_d: 2.5 });
  });
});

describe('classify', () => {
  it('derives raw, cooked, processed, and unknown from the description', () => {
    expect(deriveState('Bananas, raw')).toBe('raw');
    expect(deriveState('Chicken, breast, cooked, grilled')).toBe('cooked');
    expect(deriveState('Apples, raw, without skin, cooked, boiled')).toBe('cooked');
    expect(deriveState('Potatoes, frozen, unprepared')).toBe('raw');
    expect(deriveState('Beans, black, canned')).toBe('processed');
    expect(deriveState('Cheese, cheddar')).toBe('unknown');
    expect(deriveState('Sausage, uncooked')).toBe('raw');
  });

  it('flags restaurant categories, all-caps brands, and known brands, but not generic foods', () => {
    expect(isBranded({ description: 'Hamburger, plain', category: 'Fast Foods' })).toBe(true);
    expect(isBranded({ description: 'Candies, TWIZZLERS CHERRY BITES', category: 'Sweets' })).toBe(true);
    expect(isBranded({ description: 'Pillsbury, Cinnamon Rolls with Icing', category: 'Baked Products' })).toBe(true);
    expect(isBranded({ description: 'Beef, BBQ ribs (USDA)', category: 'Beef Products' })).toBe(false);
    expect(isBranded({ description: 'Bananas, raw', category: 'Fruits and Fruit Juices' })).toBe(false);
  });

  it("removes USDA's distribution-program annotation", () => {
    expect(cleanDescription("Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)")).toBe('Apples, raw, with skin');
  });
});

describe('the repository translation table', () => {
  it('is valid and every entry has an English and a Spanish name', () => {
    const entries = loadTranslations(path.join(__dirname, '..', 'data', 'translations.es.json'));
    expect(entries.length).toBeGreaterThanOrEqual(20);
    expect(new Set(entries.map((e) => e.en.toLowerCase())).size).toBe(entries.length);
  });

  it('rejects an entry without a Spanish name', () => {
    const file = path.join(fixture.dir, 'bad-translations.json');
    writeFileSync(file, JSON.stringify([{ en: 'Bananas, raw' }]));
    expect(() => loadTranslations(file)).toThrow(/entry 0/);
  });
});
