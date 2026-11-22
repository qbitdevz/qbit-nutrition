/// <reference types="node" />
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildCatalog } from '../builder';
import { resolveRecipes, type FactorTables, type RecipeDef } from '../recipes';
import type { BuildCounts, SourceFood, TranslationEntry } from '../types';

/** USDA nutrient ids used by the fixture foods. */
const N = { kcal: 1008, protein: 1003, fat: 1004, carbs: 1005, fiber: 1079, sodium: 1093 } as const;

function food(
  fdcId: number,
  description: string,
  per100g: { kcal: number; protein: number; carbs: number; fat: number; fiber?: number; sodium?: number },
  extra: Partial<SourceFood> = {},
): SourceFood {
  const nutrients: SourceFood['nutrients'] = [
    { id: N.kcal, unit: 'kcal', amount: per100g.kcal },
    { id: N.protein, unit: 'g', amount: per100g.protein },
    { id: N.carbs, unit: 'g', amount: per100g.carbs },
    { id: N.fat, unit: 'g', amount: per100g.fat },
  ];
  if (per100g.fiber !== undefined) nutrients.push({ id: N.fiber, unit: 'g', amount: per100g.fiber });
  if (per100g.sodium !== undefined) nutrients.push({ id: N.sodium, unit: 'mg', amount: per100g.sodium });
  return {
    source: 'usda_sr_legacy',
    fdcId,
    description,
    category: null,
    nutrients,
    portions: [],
    ...extra,
  };
}

export const FIXTURE_FOODS: SourceFood[] = [
  food(1001, 'Bananas, raw', { kcal: 89, protein: 1.09, carbs: 22.84, fat: 0.33, fiber: 2.6, sodium: 1 }, {
    category: 'Fruits and Fruit Juices',
    portions: [{ label: '1 medium (7" to 7-7/8" long)', grams: 118 }],
  }),
  food(1002, 'Rice, white, long-grain, regular, cooked', { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28 }),
  food(1003, 'Rice, white, long-grain, regular, raw', { kcal: 365, protein: 7.13, carbs: 79.95, fat: 0.66 }),
  food(1004, 'Rice, brown, long-grain, cooked', { kcal: 123, protein: 2.74, carbs: 25.58, fat: 0.97 }),
  food(1005, 'Chicken, breast, meat only, cooked, grilled', { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }),
  food(1006, 'Chicken, breast, meat only, raw', { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 }),
  // Same name twice: a restaurant entry (branded) and a generic one. The branded one has the lower id.
  food(1007, 'Hamburger, plain', { kcal: 250, protein: 13, carbs: 30, fat: 9 }, { category: 'Fast Foods' }),
  food(1008, 'Hamburger, plain', { kcal: 240, protein: 15, carbs: 25, fat: 8 }),
  food(1009, 'Tomatoes, red, ripe, raw', { kcal: 18, protein: 0.88, carbs: 3.92, fat: 0.2 }),
  // No Spanish translation: must stay searchable in English.
  food(1010, 'Lentils, raw', { kcal: 352, protein: 24.63, carbs: 63.35, fat: 1.06 }),
  // Foundation Foods style energy (Atwater, id 2047) and a unit mismatch that must be ignored.
  {
    source: 'usda_foundation',
    fdcId: 1011,
    description: 'Cheese, cheddar',
    category: 'Dairy and Egg Products',
    nutrients: [
      { id: 2047, unit: 'kcal', amount: 400 },
      { id: 1003, unit: 'g', amount: 23 },
      { id: 1093, unit: 'g', amount: 999 },
    ],
    portions: [],
  },
  // Nothing we track: left out of the catalog.
  { source: 'usda_foundation', fdcId: 1012, description: 'Water, mystery', category: null, nutrients: [{ id: 1051, unit: 'g', amount: 100 }], portions: [] },
];

export const FIXTURE_TRANSLATIONS: TranslationEntry[] = [
  { en: 'Bananas, raw', es: 'Plátano, crudo', aliases: ['banano', 'guineo'] },
  { en: 'Rice, white, long-grain, regular, cooked', es: 'Arroz blanco, cocido' },
  { en: 'Tomatoes, red, ripe, raw', es: 'Tomate, crudo', aliases: ['jitomate'] },
  { en: 'Not in the data set', es: 'No existe' },
];

export interface FixtureCatalog {
  dir: string;
  dbPath: string;
  counts: BuildCounts;
}

/** One published yield, so the fixture recipe can cite it (the real tables are in scripts/catalog/data/factors/). */
export const FIXTURE_FACTORS: FactorTables = {
  retention: { source: { title: 'Fixture retention table', url: 'fixture' }, rows: [] },
  yields: {
    source: { title: 'Fixture yield table', url: 'fixture' },
    rows: [{ foodGroup: '5', ndb: '5060', description: 'Chicken, breast', method: 'Baked or Roasted, unspecified', yieldPercent: 72 }],
  },
};

/** A recipe-calculated dish over fixture foods: 150 g raw chicken breast (72 % yield) and 200 g cooked rice. */
export const FIXTURE_RECIPE: RecipeDef = {
  id: 7,
  key: 'arroz-con-pollo-fixture',
  nameEn: 'Chicken with rice, home style',
  nameEs: 'Arroz con pollo casero',
  aliasesEn: ['chicken and rice'],
  aliasesEs: ['arroz con pollo'],
  dishType: 'rice_bean_dish',
  state: 'cooked',
  ingredients: [
    { source: 'usda_sr_legacy', sourceId: 1006, description: 'Chicken, breast, meat only, raw', grams: 150, yield: '5060|Baked or Roasted, unspecified' },
    { source: 'usda_sr_legacy', sourceId: 1002, description: 'Rice, white, long-grain, regular, cooked', grams: 200 },
  ],
  preparation: { en: 'Roast the chicken and serve it on the rice.', es: 'Asar el pollo y servirlo sobre el arroz.' },
  basis: { en: 'A home preparation written for the tests.', es: 'Una preparación casera escrita para las pruebas.' },
  portions: [{ en: '1 plate', es: '1 plato', grams: 300 }],
};

/** Builds the fixture catalog with the real builder into a fresh temp directory. `recipes: true` adds `FIXTURE_RECIPE`. */
export function buildFixtureCatalog(options: { recipes?: boolean } = {}): FixtureCatalog {
  const dir = mkdtempSync(path.join(tmpdir(), 'qn-catalog-'));
  const dbPath = path.join(dir, 'catalog.db');
  const counts = buildCatalog({
    foods: FIXTURE_FOODS,
    translations: FIXTURE_TRANSLATIONS,
    ...(options.recipes ? { recipes: resolveRecipes([FIXTURE_RECIPE], FIXTURE_FOODS, FIXTURE_FACTORS, 'fixture-recipes@1'), recipeSetVersion: 'fixture-recipes@1' } : {}),
    outPath: dbPath,
    meta: {
      dataVersion: 'fixture@1',
      buildDate: '2026-01-01T00:00:00.000Z',
      sourceFiles: ['fixture-a.zip', 'fixture-b.zip'],
    },
  });
  return { dir, dbPath, counts };
}
