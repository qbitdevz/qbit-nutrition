/** @jest-environment node */
/// <reference types="node" />
import path from 'node:path';
import { NUTRIENT_CODES } from '../../../src/core/nutrition/types';
import { DISH_TYPES, loadFactors, loadRecipes, yieldKey } from '../recipes';

/**
 * The committed recipe data and factor tables (odd/tasks/catalog-expansion.md T4, S4, S7): checks that need no download and no
 * built catalog, so they always run. Ingredient existence is checked by the build itself (resolveRecipes) and by recipeCatalog.test.ts.
 */
const DATA = path.join(__dirname, '..', 'data');
const { version, recipes } = loadRecipes(path.join(DATA, 'recipes'));
const factors = loadFactors(path.join(DATA, 'factors'));

describe('the recipe set', () => {
  it('has a version and at least 40 dishes', () => {
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(recipes.length).toBeGreaterThanOrEqual(40);
  });

  it('gives every dish a stable positive id and key, used once', () => {
    const ids = recipes.map((r) => r.id);
    expect(ids.every((id) => Number.isInteger(id) && id >= 1 && id < 100000)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(recipes.map((r) => r.key)).size).toBe(recipes.length);
    expect(recipes.every((r) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.key))).toBe(true);
  });

  it('names every dish in Spanish and English, with regional aliases in both', () => {
    for (const r of recipes) {
      expect([r.key, r.nameEn.trim().length > 3, r.nameEs.trim().length > 3]).toEqual([r.key, true, true]);
      expect([r.key, (r.aliasesEn ?? []).length > 0, (r.aliasesEs ?? []).length > 0]).toEqual([r.key, true, true]);
    }
    // Two dishes must not share a name in either language.
    expect(new Set(recipes.map((r) => r.nameEn.toLowerCase())).size).toBe(recipes.length);
    expect(new Set(recipes.map((r) => r.nameEs.toLowerCase())).size).toBe(recipes.length);
  });

  it('documents every dish: preparation and the origin of the proportions in both languages, and household portions', () => {
    for (const r of recipes) {
      expect([r.key, r.preparation.en.length >= 40, r.preparation.es.length >= 40]).toEqual([r.key, true, true]);
      expect([r.key, r.basis.en.length >= 80, r.basis.es.length >= 80]).toEqual([r.key, true, true]);
      expect([r.key, r.portions.length >= 1, r.portions.every((p) => p.grams > 0 && p.en.length > 0 && p.es.length > 0)]).toEqual([r.key, true, true]);
    }
  });

  it('uses a known dish type, ingredients by source and id with their catalog description, and positive grams', () => {
    for (const r of recipes) {
      expect([r.key, DISH_TYPES.includes(r.dishType)]).toEqual([r.key, true]);
      expect(r.ingredients.length).toBeGreaterThanOrEqual(1);
      for (const i of r.ingredients) {
        expect([r.key, i.source, Number.isInteger(i.sourceId), i.description.length > 0, i.grams > 0]).toEqual([r.key, i.source, true, true, true]);
        expect(['usda_foundation', 'usda_sr_legacy', 'usda_fndds', 'usda_branded']).toContain(i.source);
      }
    }
  });

  it('names an assumption of the project wherever it states absorbed fat, in both languages', () => {
    for (const r of recipes.filter((x) => x.ingredients.some((i) => i.absorbed))) {
      expect([r.key, /assumption/i.test(r.basis.en), /supuesto/i.test(r.basis.es)]).toEqual([r.key, true, true]);
    }
  });

  it('gives every moisture group a reference food and every group ingredient a defined group', () => {
    for (const r of recipes) {
      for (const i of r.ingredients.filter((x) => x.group !== undefined)) expect([r.key, r.moistureGroups?.[i.group as string] !== undefined]).toEqual([r.key, true]);
      for (const ref of Object.values(r.moistureGroups ?? {})) expect(ref.description.length).toBeGreaterThan(0);
    }
  });

  it('uses one weight rule per dish: a declared weight never goes with a yield', () => {
    for (const r of recipes.filter((x) => x.finalGrams !== undefined)) expect(r.ingredients.some((i) => i.yield !== undefined)).toBe(false);
  });

  it('cites only yield and retention rows that exist in the published tables', () => {
    const yields = new Set(factors.yields.rows.map(yieldKey));
    const codes = new Set(factors.retention.rows.map((r) => r.code));
    for (const r of recipes) {
      for (const i of r.ingredients) {
        if (i.yield !== undefined) expect([r.key, yields.has(i.yield)]).toEqual([r.key, true]);
        if (i.retention !== undefined) expect([r.key, codes.has(i.retention)]).toEqual([r.key, true]);
      }
    }
  });

  it('never mentions a composition table that is not bundled (docs/catalog-sources.md section 2): its values are not an input', () => {
    const text = JSON.stringify(recipes);
    expect(text).not.toMatch(/argenfoods|bedca|unlu\.edu|tabla de composici[oó]n|incmnsz|tcac|latinfoods|ciqual/i);
  });
});

describe('the published factor tables', () => {
  it('keep the number of rows of the files they were converted from (270 retention rows, 173 yield rows)', () => {
    expect(factors.retention.rows).toHaveLength(270);
    expect(factors.yields.rows).toHaveLength(173);
    expect(new Set(factors.yields.rows.map(yieldKey)).size).toBe(173);
  });

  it('cite their publication, publisher, date and address', () => {
    expect(factors.retention.source).toMatchObject({ title: 'USDA Table of Nutrient Retention Factors, Release 6', date: 'December 2007' });
    expect(factors.yields.source).toMatchObject({ title: 'USDA Table of Cooking Yields for Meat and Poultry, Release 2', date: 'September 2014' });
    for (const s of [factors.retention.source, factors.yields.source]) {
      expect(s.publisher).toMatch(/Agricultural Research Service/);
      expect(s.url).toMatch(/^https:\/\/www\.ars\.usda\.gov\/ARSUserFiles\//);
    }
  });

  it('hold the rows used by the recipes exactly as published (read by hand from the downloaded files on 2026-11-22)', () => {
    const ret = (code: string) => factors.retention.rows.find((r) => r.code === code)!;
    // retn06.txt: "~0605~^~13~^~BEEF,FRIED~^~417~^~Folate, total~^~85~" and "~418~^~Vitamin B-12~^~80~".
    expect(ret('0605')).toMatchObject({ description: 'BEEF,FRIED', percent: { folate: 85, vit_b12: 80, calcium: 100, iron: 95 } });
    expect(ret('0103')).toMatchObject({ description: 'EGGS,FRIED,SCRAMBLED', percent: { folate: 75, vit_b12: 85 } });
    expect(ret('0305')).toMatchObject({ description: 'FLOUR/MEAL,SAUTEED', percent: { folate: 65, vit_b12: 100 } });
    expect(ret('0805')).toMatchObject({ description: 'CHICKEN,ROASTED', percent: { vit_c: 80, folate: 60, vit_b12: 65 } });
    expect(ret('0301')).toMatchObject({ description: 'FLOUR/MEAL,BAKED', percent: { folate: 70 } });
    // Release 6: the table covers these tracked nutrients and not the others.
    expect(Object.keys(ret('0605').percent).sort()).toEqual(['calcium', 'folate', 'iron', 'magnesium', 'potassium', 'sodium', 'vit_a', 'vit_b12', 'vit_c', 'zinc']);
    expect(NUTRIENT_CODES.filter((c) => !(c in ret('0605').percent))).toEqual(['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugars', 'sat_fat', 'vit_d']);

    const yieldOf = (ndb: string, method: string) => factors.yields.rows.find((r) => r.ndb === ndb && r.method === method)!.yieldPercent;
    // USDA_CookingYields_MeatPoultry02.xlsx, column "Cooking Yield %".
    expect(yieldOf('13893', 'Broiled or Grilled')).toBe(72); // beef, top round steak
    expect(yieldOf('13918', 'Broiled or Grilled')).toBe(80); // beef, tenderloin steak
    expect(yieldOf('5060', 'Baked or Roasted, unspecified')).toBe(72); // chicken breast, meat and skin
    expect(yieldOf('23575', 'Pan-fried')).toBe(67); // ground beef, medium fat, crumbles
    expect(yieldOf('7064', 'Pan-fried')).toBe(80); // pork sausage, fresh
    expect(yieldOf('10186', 'Pan-fried')).toBe(77); // pork loin, top loin chops, boneless
    expect(yieldOf('10862', 'Pan-fried')).toBe(32); // bacon
  });

  it('keep every percentage in range: retention from 0 to 100, yield from 1 to 150', () => {
    for (const r of factors.retention.rows) for (const v of Object.values(r.percent)) expect([r.code, v >= 0 && v <= 100]).toEqual([r.code, true]);
    for (const r of factors.yields.rows) expect([yieldKey(r), r.yieldPercent >= 1 && r.yieldPercent <= 150]).toEqual([yieldKey(r), true]);
  });
});
