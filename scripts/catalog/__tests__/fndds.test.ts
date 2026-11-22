/** @jest-environment node */
/// <reference types="node" />
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalog, trackedAmounts } from '../builder';
import type { SourceFood } from '../types';
import { parseUsdaJson } from '../usda';

/**
 * Rows copied by hand from FoodData_Central_survey_food_json_2024-10-31.zip (FNDDS 2021-2023),
 * read straight from the downloaded JSON: nutrient id, unit and amount as USDA publishes them (per 100 g).
 */
const n = (id: number, unitName: string, amount: number) => ({ nutrient: { id, unitName }, amount });
const SURVEY = JSON.stringify({
  SurveyFoods: [
    {
      fdcId: 2708711,
      description: 'Empanada, beef',
      wweiaFoodCategory: { wweiaFoodCategoryDescription: 'Turnovers and other grain-based items' },
      foodNutrients: [
        n(1003, 'g', 12.1), n(1004, 'g', 19.2), n(1005, 'g', 27.4), n(1008, 'kcal', 333), n(1018, 'g', 0), n(1051, 'g', 48.2),
        n(2000, 'g', 2.1), n(1079, 'g', 1.6), n(1087, 'mg', 50), n(1089, 'mg', 2.04), n(1090, 'mg', 18), n(1092, 'mg', 187),
        n(1093, 'mg', 459), n(1095, 'mg', 2.3), n(1106, 'µg', 12), n(1114, 'µg', 0), n(1162, 'mg', 1.3), n(1177, 'µg', 35),
        n(1178, 'µg', 0.82), n(1258, 'g', 6.92),
      ],
      foodPortions: [
        { measureUnit: { name: 'undetermined' }, gramWeight: 105, portionDescription: 'Quantity not specified' },
        { measureUnit: { name: 'undetermined' }, gramWeight: 130, portionDescription: '1 regular/large' },
        { measureUnit: { name: 'undetermined' }, gramWeight: 35, portionDescription: '1 small/individual' },
      ],
    },
    {
      fdcId: 2705699,
      description: 'Dulce de leche',
      wweiaFoodCategory: { wweiaFoodCategoryDescription: 'Jams, syrups, toppings' },
      foodNutrients: [
        n(1003, 'g', 6.84), n(1004, 'g', 7.35), n(1005, 'g', 55.4), n(1008, 'kcal', 315), n(2000, 'g', 49.7), n(1079, 'g', 0),
        n(1087, 'mg', 251), n(1089, 'mg', 0.17), n(1090, 'mg', 22), n(1092, 'mg', 350), n(1093, 'mg', 129), n(1095, 'mg', 0.79),
        n(1106, 'µg', 74), n(1114, 'µg', 0.2), n(1162, 'mg', 2.6), n(1177, 'µg', 11), n(1178, 'µg', 0.31), n(1258, 'g', 4.53),
      ],
      foodPortions: [{ measureUnit: { name: 'undetermined' }, gramWeight: 300, portionDescription: '1 cup' }],
    },
  ],
});

describe('FNDDS rows, checked by hand against the published file', () => {
  const foods = parseUsdaJson('usda_fndds', SURVEY);

  it('maps every tracked nutrient of "Empanada, beef" with the units USDA publishes', () => {
    expect(trackedAmounts(foods[0] as SourceFood)).toEqual({
      kcal: 333, protein: 12.1, carbs: 27.4, fat: 19.2, fiber: 1.6, sugars: 2.1, sat_fat: 6.92,
      sodium: 459, potassium: 187, calcium: 50, iron: 2.04, magnesium: 18, zinc: 2.3,
      vit_a: 12, vit_c: 1.3, vit_d: 0, vit_b12: 0.82, folate: 35,
    });
  });

  it('maps "Dulce de leche" (sugars 49.7 g, calcium 251 mg, vitamin D 0.2 µg)', () => {
    expect(trackedAmounts(foods[1] as SourceFood)).toMatchObject({ kcal: 315, sugars: 49.7, calcium: 251, vit_d: 0.2, sat_fat: 4.53 });
  });

  it('is written to catalog.db with its source, source id, state, portions and no invented value', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qn-fndds-'));
    const outPath = path.join(dir, 'catalog.db');
    const counts = buildCatalog({
      foods,
      translations: [],
      outPath,
      meta: { dataVersion: 't', buildDate: '2026-01-01T00:00:00.000Z', sourceFiles: ['s.zip'] },
    });
    expect(counts.food).toBe(2);
    const db = new DatabaseSync(outPath, { readOnly: true });
    expect({ ...(db.prepare('SELECT source, source_id, state, category, is_branded, kcal_100g FROM food WHERE id = 2708711').get() as object) }).toEqual({
      source: 'usda_fndds',
      source_id: '2708711',
      state: 'cooked',
      category: 'Turnovers and other grain-based items',
      is_branded: 0,
      kcal_100g: 333,
    });
    expect(db.prepare('SELECT label, grams FROM food_portion WHERE food_id = 2708711 ORDER BY rowid').all().map((r) => ({ ...r }))).toEqual([
      { label: '1 regular/large', grams: 130 },
      { label: '1 small/individual', grams: 35 },
    ]);
    // 18 tracked nutrients stored for the empanada: exactly the ones the file had, nothing derived.
    expect((db.prepare('SELECT count(*) AS c FROM food_nutrient WHERE food_id = 2708711').get() as { c: number }).c).toBe(18);
    db.close();
  });

  it('does not let a food without tracked nutrients (left out of the catalog) hide its duplicate from another source', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qn-dedupe-empty-'));
    const outPath = path.join(dir, 'catalog.db');
    const empty: SourceFood = { source: 'usda_foundation', fdcId: 1, description: 'Kale, raw', category: null, nutrients: [{ id: 1051, unit: 'g', amount: 90 }], portions: [] };
    const real: SourceFood = { source: 'usda_fndds', fdcId: 2, description: 'Kale, raw', category: null, nutrients: [{ id: 1008, unit: 'kcal', amount: 35 }], portions: [] };
    const counts = buildCatalog({ foods: [empty, real], translations: [], outPath, meta: { dataVersion: 't', buildDate: 'x', sourceFiles: [] } });
    expect(counts.food).toBe(1);
    expect(counts.duplicatesDropped).toBe(0);
    const db = new DatabaseSync(outPath, { readOnly: true });
    expect({ ...(db.prepare('SELECT id, source FROM food').get() as object) }).toEqual({ id: 2, source: 'usda_fndds' });
    db.close();
  });

  it('keeps one food when two sources publish the same one, the analytical source winning, and records the count', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qn-dedupe-'));
    const outPath = path.join(dir, 'catalog.db');
    const kale = (source: SourceFood['source'], fdcId: number, description: string): SourceFood => ({
      source,
      fdcId,
      description,
      category: null,
      nutrients: [{ id: 1008, unit: 'kcal', amount: 35 }],
      portions: source === 'usda_fndds' ? [{ label: '1 cup', grams: 21 }] : [],
    });
    const counts = buildCatalog({
      foods: [kale('usda_fndds', 3, 'Kale, raw'), kale('usda_sr_legacy', 2, 'Kale, raw'), kale('usda_foundation', 1, 'Kales, raw')],
      translations: [],
      outPath,
      meta: { dataVersion: 't', buildDate: '2026-01-01T00:00:00.000Z', sourceFiles: ['s.zip'] },
    });
    expect(counts.food).toBe(1);
    expect(counts.duplicatesDropped).toBe(2);
    const db = new DatabaseSync(outPath, { readOnly: true });
    expect({ ...(db.prepare('SELECT id, source FROM food').get() as object) }).toEqual({ id: 1, source: 'usda_foundation' });
    expect(db.prepare('SELECT label FROM food_portion WHERE food_id = 1').all().map((r) => ({ ...r }))).toEqual([{ label: '1 cup' }]);
    expect((db.prepare("SELECT value FROM catalog_meta WHERE key = 'duplicates_dropped'").get() as { value: string }).value).toBe('2');
    db.close();
  });
});
