/** @jest-environment node */
/// <reference types="node" />
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RECIPE_ID_BASE } from '../../../src/core/catalog/recipes';
import { buildCatalog, trackedAmounts } from '../builder';
import { resolveRecipes, type FactorTables, type RecipeDef } from '../recipes';
import type { SourceFood } from '../types';

/**
 * Recipes as data: resolving ingredients by source and id, factors by their published keys, and writing the dish into
 * catalog.db (odd/tasks/catalog-expansion.md T4, S7, S8). Ingredient values here are made up for easy arithmetic.
 */
const nutrients = (v: { kcal: number; protein: number; carbs: number; fat: number; vit_c?: number; water: number }): SourceFood['nutrients'] => [
  { id: 1008, unit: 'kcal', amount: v.kcal },
  { id: 1003, unit: 'g', amount: v.protein },
  { id: 1005, unit: 'g', amount: v.carbs },
  { id: 1004, unit: 'g', amount: v.fat },
  { id: 1051, unit: 'g', amount: v.water },
  ...(v.vit_c !== undefined ? [{ id: 1162, unit: 'mg', amount: v.vit_c }] : []),
];

const CHICKEN: SourceFood = { source: 'usda_sr_legacy', fdcId: 11, description: 'Chicken, breast, raw', category: 'Poultry Products', nutrients: nutrients({ kcal: 120, protein: 22.5, carbs: 0, fat: 2.6, vit_c: 10, water: 75 }), portions: [] };
const OIL: SourceFood = { source: 'usda_sr_legacy', fdcId: 12, description: 'Oil, soybean', category: 'Fats and Oils', nutrients: nutrients({ kcal: 884, protein: 0, carbs: 0, fat: 100, water: 0 }), portions: [] };
const FOODS = [CHICKEN, OIL];

const FACTORS: FactorTables = {
  retention: {
    source: { title: 'Retention', url: 'u' },
    rows: [{ code: '0805', foodGroup: '05', description: 'CHICKEN,ROASTED', percent: { vit_c: 80 } }],
  },
  yields: {
    source: { title: 'Yields', url: 'u' },
    rows: [{ foodGroup: '5', ndb: '5060', description: 'Chicken, broiler-fryer, breast, meat and skin', method: 'Baked or Roasted, unspecified', yieldPercent: 72 }],
  },
};

const RECIPE: RecipeDef = {
  id: 1,
  key: 'test-chicken',
  nameEn: 'Chicken test dish',
  nameEs: 'Plato de prueba de pollo',
  aliasesEn: ['roast chicken test'],
  aliasesEs: ['pollo de prueba'],
  dishType: 'cheese_dish',
  state: 'cooked',
  ingredients: [
    { source: 'usda_sr_legacy', sourceId: 11, description: 'Chicken, breast, raw', grams: 200, yield: '5060|Baked or Roasted, unspecified', retention: '0805' },
    { source: 'usda_sr_legacy', sourceId: 12, description: 'Oil, soybean', grams: 10, absorbed: true },
  ],
  preparation: { en: 'Roast the breast with oil.', es: 'Asar la pechuga con aceite.' },
  basis: { en: 'A typical home preparation written by the project.', es: 'Una preparación casera típica escrita por el proyecto.' },
  portions: [{ en: '1 piece', es: '1 trozo', grams: 150 }],
};

const resolve = (over: Partial<RecipeDef> = {}, foods: readonly SourceFood[] = FOODS) => resolveRecipes([{ ...RECIPE, ...over }], foods, FACTORS, 'v-test');

describe('resolveRecipes', () => {
  it('calculates per-100 g values from catalog ingredients, the published yield and the retention factor', () => {
    // final weight = 200 x 0.72 + 10 = 154 g. kcal = 200/100*120 + 10/100*884 = 240 + 88.4 = 328.4 -> 328.4 / 154 * 100 = 213.247 (stored to 3 decimals).
    // protein = 2 x 22.5 = 45 -> 29.22. fat = 2 x 2.6 + 10 = 15.2 -> 9.87. vit C = 2 x 10 x 0.80 = 16 mg (oil is 4.8 % of the weight: minor, counted as zero) -> 10.39.
    const [r] = resolve();
    const v = trackedAmounts(r!.food);
    expect(v).toEqual({ kcal: 213.247, protein: 29.221, carbs: 0, fat: 9.87, vit_c: 10.39 });
    expect(r!.rawGrams).toBe(210);
    expect(r!.finalGrams).toBeCloseTo(154, 9);
  });

  it('gives the dish its own source, a stable id from the recipe, the state and a household portion', () => {
    const [r] = resolve();
    expect(r!.food).toMatchObject({
      source: 'qbit_recipe',
      fdcId: RECIPE_ID_BASE + 1,
      description: 'Chicken test dish',
      state: 'cooked',
      portions: [{ label: '1 piece', grams: 150 }],
      portionsEs: [{ label: '1 trozo', grams: 150 }],
    });
  });

  it('records, for each ingredient, the yield and where it comes from', () => {
    const [r] = resolve();
    expect(r!.ingredients[0]).toMatchObject({ source: 'usda_sr_legacy', sourceId: 11, grams: 200, yieldPercent: 72, absorbed: false });
    expect(r!.ingredients[0]!.yieldSource).toBe('Yields: 5060, Baked or Roasted, unspecified, 72 %');
    expect(r!.ingredients[0]!.retentionSource).toBe('Retention: 0805 CHICKEN,ROASTED');
    expect(r!.ingredients[1]).toMatchObject({ absorbed: true, yieldPercent: null, yieldSource: null, retentionSource: null });
  });

  it('fails the build with the recipe, the ingredient and the missing food when an ingredient is not in the catalog', () => {
    expect(() => resolve({ ingredients: [{ source: 'usda_sr_legacy', sourceId: 999, description: 'Flour', grams: 10 }] })).toThrow(
      /Recipe "test-chicken": ingredient usda_sr_legacy:999 \("Flour"\) is not in the catalog data/,
    );
  });

  it('fails when the id exists but is another food (the description in the recipe must match)', () => {
    expect(() => resolve({ ingredients: [{ source: 'usda_sr_legacy', sourceId: 11, description: 'Beef, raw', grams: 10 }] })).toThrow(
      /Recipe "test-chicken": usda_sr_legacy:11 is "Chicken, breast, raw", not "Beef, raw"/,
    );
  });

  it('fails on a yield or retention key that is not in the published table, naming it', () => {
    expect(() => resolve({ ingredients: [{ ...RECIPE.ingredients[0]!, yield: '1|Fried' }] })).toThrow(/yield "1\|Fried" is not in the USDA cooking yield table/);
    expect(() => resolve({ ingredients: [{ ...RECIPE.ingredients[0]!, retention: '9999' }] })).toThrow(/retention "9999" is not in the USDA retention table/);
  });

  it('fails when a recipe has both a declared final weight and ingredient yields (one weight rule per recipe)', () => {
    expect(() => resolve({ finalGrams: 100 })).toThrow(/declares a final weight and also uses a yield/);
  });

  it('fails on a duplicate id or key, an id that is not a positive integer, and an empty Spanish name', () => {
    expect(() => resolveRecipes([RECIPE, { ...RECIPE, key: 'other' }], FOODS, FACTORS, 'v')).toThrow(/Recipe id 1 is used twice/);
    expect(() => resolveRecipes([RECIPE, { ...RECIPE, id: 2 }], FOODS, FACTORS, 'v')).toThrow(/Recipe key "test-chicken" is used twice/);
    expect(() => resolve({ id: 0 })).toThrow(/id must be a positive integer/);
    expect(() => resolve({ nameEs: ' ' })).toThrow(/needs a Spanish name/);
  });

  it('uses the catalog water of the reference food to set the weight of a moisture group', () => {
    // group "dough": the oil (water 0) is the only member, so its solids are 10 g; the chicken stands in as the reference food (water 75 %): 10 / (1 - 0.75) = 40 g.
    const [r] = resolve({
      ingredients: [{ source: 'usda_sr_legacy', sourceId: 12, description: 'Oil, soybean', grams: 10, group: 'dough' }],
      moistureGroups: { dough: { source: 'usda_sr_legacy', sourceId: 11, description: 'Chicken, breast, raw' } },
    });
    expect(r!.finalGrams).toBeCloseTo(40, 9);
  });
});

describe('recipes in catalog.db', () => {
  const build = (foods: SourceFood[] = FOODS) => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'qn-recipes-')), 'catalog.db');
    const recipes = resolve({}, foods);
    buildCatalog({
      foods,
      translations: [],
      recipes,
      recipeSetVersion: 'v-test',
      outPath: out,
      meta: { dataVersion: 't', buildDate: 'x', sourceFiles: [] },
    });
    return new DatabaseSync(out, { readOnly: true });
  };
  const all = (db: DatabaseSync, sql: string, ...p: (string | number)[]) => db.prepare(sql).all(...p).map((r) => ({ ...r }));

  it('writes the food with its own source, the stable id, the recipe name and aliases in both languages, and the portions', () => {
    const db = build();
    const id = RECIPE_ID_BASE + 1;
    expect({ ...(db.prepare('SELECT source, source_id, state, is_branded, kcal_100g FROM food WHERE id = ?').get(id) as object) }).toEqual({
      source: 'qbit_recipe',
      source_id: 'test-chicken',
      state: 'cooked',
      is_branded: 0,
      kcal_100g: 213.247,
    });
    expect(all(db, 'SELECT locale, name, is_alias, origin FROM food_name WHERE food_id = ? ORDER BY locale, is_alias, name', id)).toEqual([
      { locale: 'en', name: 'Chicken test dish', is_alias: 0, origin: 'source' },
      { locale: 'en', name: 'roast chicken test', is_alias: 1, origin: 'synonym' },
      { locale: 'es', name: 'Plato de prueba de pollo', is_alias: 0, origin: 'handwritten' },
      { locale: 'es', name: 'pollo de prueba', is_alias: 1, origin: 'handwritten' },
    ]);
    expect(all(db, 'SELECT locale, label, grams FROM food_portion WHERE food_id = ? ORDER BY locale', id)).toEqual([
      { locale: 'en', label: '1 piece', grams: 150 },
      { locale: 'es', label: '1 trozo', grams: 150 },
    ]);
    db.close();
  });

  it('writes the method: texts, weights, and one row per ingredient pointing at the ingredient food of the catalog', () => {
    const db = build();
    const id = RECIPE_ID_BASE + 1;
    expect(all(db, 'SELECT key, version, preparation_en, basis_es, raw_grams, final_grams, weight_rule, unknown_nutrients FROM recipe WHERE food_id = ?', id)).toEqual([
      {
        key: 'test-chicken',
        version: 'v-test',
        preparation_en: 'Roast the breast with oil.',
        basis_es: 'Una preparación casera típica escrita por el proyecto.',
        raw_grams: 210,
        final_grams: 154,
        weight_rule: 'yields',
        unknown_nutrients: expect.stringContaining('vit_d'),
      },
    ]);
    expect(all(db, 'SELECT position, ingredient_food_id, source, source_id, grams, yield_percent, absorbed FROM recipe_ingredient WHERE food_id = ? ORDER BY position', id)).toEqual([
      { position: 1, ingredient_food_id: 11, source: 'usda_sr_legacy', source_id: '11', grams: 200, yield_percent: 72, absorbed: 0 },
      { position: 2, ingredient_food_id: 12, source: 'usda_sr_legacy', source_id: '12', grams: 10, yield_percent: null, absorbed: 1 },
    ]);
    db.close();
  });

  it('records the recipe set version and the number of recipes in catalog_meta, and leaves other sources alone', () => {
    const db = build();
    expect(all(db, "SELECT key, value FROM catalog_meta WHERE key IN ('recipe_set_version', 'recipes') ORDER BY key")).toEqual([
      { key: 'recipe_set_version', value: 'v-test' },
      { key: 'recipes', value: '1' },
    ]);
    expect(all(db, "SELECT count(*) AS n FROM food WHERE source <> 'qbit_recipe'")).toEqual([{ n: 2 }]);
    db.close();
  });

  it('points an ingredient dropped as a duplicate at the food that stands for it', () => {
    const twin: SourceFood = { ...CHICKEN, source: 'usda_fndds', fdcId: 21 }; // same description: FNDDS loses to SR Legacy
    const foods = [CHICKEN, OIL, twin];
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'qn-recipes-')), 'catalog.db');
    const recipes = resolve({ ingredients: [{ source: 'usda_fndds', sourceId: 21, description: 'Chicken, breast, raw', grams: 100 }] }, foods);
    buildCatalog({ foods, translations: [], recipes, recipeSetVersion: 'v', outPath: out, meta: { dataVersion: 't', buildDate: 'x', sourceFiles: [] } });
    const db = new DatabaseSync(out, { readOnly: true });
    expect(all(db, 'SELECT ingredient_food_id, source, source_id FROM recipe_ingredient WHERE food_id = ?', RECIPE_ID_BASE + 1)).toEqual([{ ingredient_food_id: 11, source: 'usda_fndds', source_id: '21' }]);
    db.close();
  });
});
