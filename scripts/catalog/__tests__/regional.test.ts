/** @jest-environment node */
/// <reference types="node" />
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalog, trackedAmounts } from '../builder';
import { loadRegional } from '../regionalFoods';
import { toSourceFood } from '../regional';

/** Values copied from the FoodData Central Branded file, fdcId 1948673 (read straight from the downloaded JSON). */
const BRANDED = {
  fdcId: 1948673,
  description: "ALFAJORES CHOCOLATE",
  brandOwner: 'D\'MASA',
  brandedFoodCategory: 'Cookies & Biscuits',
  servingSize: 50,
  servingSizeUnit: 'g',
  foodNutrients: [
    { nutrient: { id: 1008, unitName: 'KCAL' }, amount: 420 },
    { nutrient: { id: 1003, unitName: 'G' }, amount: 6 },
    { nutrient: { id: 1005, unitName: 'G' }, amount: 54 },
    { nutrient: { id: 1004, unitName: 'G' }, amount: 20 },
  ],
};
const SELECTION = { fdcId: 1948673, en: 'Alfajor, chocolate', es: 'Alfajor de chocolate', portionLabel: '1 alfajor' };

describe('regional foods (optional Branded Foods selection)', () => {
  it('keeps the data values, a generic name instead of the brand, and a household portion with the grams of the label', () => {
    const food = toSourceFood(BRANDED, SELECTION);
    expect(food).toMatchObject({ source: 'usda_branded', fdcId: 1948673, description: 'Alfajor, chocolate', portions: [{ label: '1 alfajor', grams: 50 }] });
    expect(JSON.stringify(food)).not.toMatch(/MASA/i);
    expect(trackedAmounts(food)).toEqual({ kcal: 420, protein: 6, carbs: 54, fat: 20 });
  });

  it('drops the portion when no household label was chosen, instead of inventing one', () => {
    expect(toSourceFood(BRANDED, { ...SELECTION, portionLabel: undefined }).portions).toEqual([]);
  });

  it('is written to catalog.db with its source and id, the handwritten Spanish name and the aliases, unbranded', () => {
    const file = path.join(__dirname, '..', 'data', 'regional-foods.json');
    const regional = loadRegional(file);
    expect(regional.foods.length).toBeGreaterThanOrEqual(5);
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'qn-regional-')), 'catalog.db');
    buildCatalog({ foods: regional.foods, translations: regional.translations, aliasRules: regional.aliasRules, outPath: out, meta: { dataVersion: 't', buildDate: 'x', sourceFiles: [] } });
    const db = new DatabaseSync(out, { readOnly: true });
    const row = db.prepare('SELECT source, source_id, is_branded, kcal_100g FROM food WHERE id = 1948673').get() as Record<string, unknown>;
    expect({ ...row }).toEqual({ source: 'usda_branded', source_id: '1948673', is_branded: 0, kcal_100g: 420 });
    const names = db.prepare('SELECT locale, name, is_alias FROM food_name WHERE food_id = 1948673').all().map((r) => ({ ...r }));
    expect(names).toEqual(expect.arrayContaining([
      { locale: 'en', name: 'Alfajor, chocolate', is_alias: 0 },
      { locale: 'es', name: 'Alfajor de chocolate', is_alias: 0 },
      { locale: 'es', name: 'alfajores', is_alias: 1 },
      { locale: 'en', name: 'alfajor', is_alias: 1 },
    ]));
    db.close();
    expect(readFileSync(file, 'utf8')).toContain('"dataFile"');
  });
});
