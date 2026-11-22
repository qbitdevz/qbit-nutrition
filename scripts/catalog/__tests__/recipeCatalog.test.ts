/** @jest-environment node */
/// <reference types="node" />
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createCatalog } from '../../../src/core/catalog';
import { isRecipeRef, RECIPE_ID_BASE } from '../../../src/core/catalog/recipes';
import { NUTRIENT_CODES, type NutrientCode } from '../../../src/core/nutrition/types';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from '../nodeSqlitePort';
import { loadRecipes, type DishType } from '../recipes';

/**
 * Sanity gates over the recipe-calculated foods of the built catalog (odd/tasks/catalog-expansion.md T4, S5, S7): energy against the
 * macronutrients, physical bounds, plausible ranges per kind of dish taken from comparable foods of the catalog itself, weights through
 * the yields, and three recipes checked by hand. They run when `catalog-build/catalog.db` exists; CI does not build it, so the suite is
 * skipped there and says so in its name.
 */
const BUILT = path.join(__dirname, '..', '..', '..', 'catalog-build', 'catalog.db');
const built = existsSync(BUILT);
const describeBuilt = built ? describe : describe.skip;
const label = built
  ? 'recipe foods, built catalog'
  : 'recipe foods, built catalog (SKIPPED: catalog-build/catalog.db not found; run "npm run catalog:build" to check the real catalog)';

interface Dish {
  id: number;
  key: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrients: Partial<Record<NutrientCode, number>>;
  raw: number;
  final: number;
  rule: string;
  unknown: string[];
}

/**
 * Comparable foods of the catalog (by their English description) for each kind of dish: where the plausible range comes from. A dish must
 * lie within the energy of its comparables widened by 25 % on each side (from 0.75 x the lowest to 1.25 x the highest). None of these is
 * an excluded composition table: they are USDA Foundation, SR Legacy and FNDDS entries already in the catalog.
 */
const COMPARABLES: Record<DishType, string[]> = {
  breaded_meat: [
    'Chicken breast, fried, coated, skin / coating eaten, from raw',
    'Chicken breast, fried, coated, skin / coating not eaten, from raw',
    'Chicken breast, fried, coated, prepared skinless, coating eaten, from raw',
    'Veal, leg (top round), separable lean and fat, cooked, pan-fried, breaded',
    'Veal, leg (top round), separable lean only, cooked, pan-fried, breaded',
  ],
  filled_pastry: ['Empanada, beef', 'Empanada, chicken', 'Empanada, NFS', 'Empanada, no meat', 'Restaurant, Latino, empanadas, beef, prepared', 'Pot pie, beef', 'Turnover or hot pocket, pizza pocket, meat'],
  tart: ['Quiche with meat, poultry or fish', 'Spinach quiche, meatless', 'Cheese quiche, meatless'],
  bread_pastry: ['Croissants, butter', 'Croissants, cheese', 'Danish pastry, cheese', 'Bread, cheese', 'Biscuits, plain or buttermilk, frozen, baked'],
  sandwich: ['Ham sandwich on white, with cheese', 'Ham sandwich on wheat, with cheese', 'Ham sandwich or sub, with cheese, restaurant', 'Turkey and ham sandwich on white, with cheese', "HOT POCKETS Ham 'N Cheese Stuffed Sandwich, frozen"],
  cheese_dish: ['Cheese, provolone', 'Cheese, mozzarella, whole milk', 'Cheese, cheddar', 'Cheese, swiss'],
  stew: ['Beef stew, canned entree', 'Stew, steamed corn (Navajo)', 'Acorn stew (Apache)', 'Egg casserole with bread, cheese, milk and meat'],
  pasta_dish: ['Pasta, cooked', 'Ravioli, cheese-filled, with tomato sauce', 'Gnocchi, potato', 'Spaghetti, with meatballs in tomato sauce, canned', 'Pasta with tomato sauce, no meat, canned', 'Ravioli, meat-filled, with tomato sauce or meat sauce'],
  egg_potato_dish: ['Egg, whole, cooked, omelet', 'Egg, whole, cooked, scrambled', 'Potato pancakes', 'Egg casserole with bread, cheese, milk and meat'],
  pizza_flatbread: ['Pizza, cheese topping, regular crust, frozen, cooked', 'PIZZA HUT 12" Cheese Pizza, Pan Crust', 'PAPA JOHN\'S 14" Cheese Pizza, Original Crust', 'LITTLE CAESARS 14" Cheese Pizza, Thin Crust'],
  rice_bean_dish: ['Beans, black, mature seeds, cooked, boiled, without salt', 'Rice, white, cooked, made with oil', 'Beans, baked, canned, with pork and tomato sauce', 'Beans and white rice', 'Restaurant, Latino, Arroz con frijoles negros (rice and black beans)'],
  dessert: ['Desserts, flan, caramel custard, prepared-from-recipe', 'Cheesecake, plain', 'Cake, cheesecake, commercially prepared', 'Pie, egg custard, commercially prepared', 'Pudding, rice'],
  sweet_biscuit: ['Cookies, butter, commercially prepared, enriched', 'Cookies, shortbread, commercially prepared, plain', 'Cookies, chocolate sandwich, with creme filling, regular', 'Cookies, chocolate wafers', 'Cookie, ladyfinger'],
  hot_drink: ['Coffee, Latte', 'Coffee, Cappuccino', 'Hot chocolate / cocoa, NFS', 'Hot chocolate / cocoa, with whipped cream', 'Beverages, coffee, ready to drink, milk based, sweetened'],
  infusion: ['Beverages, coffee, brewed, prepared with tap water', 'Water, tap', 'Beverages, tea, green, ready-to-drink, sweetened', 'Beverages, tea, green, ready to drink, unsweetened'],
  cold_dish: ['Potato salad, home-prepared', 'Potato salad with egg', 'Potato salad, made with mayonnaise', 'Tuna salad with egg', 'Fish, tuna salad'],
};

describeBuilt(label, () => {
  // Opened in beforeAll: a skipped describe still runs its body, and CI has no built catalog to open.
  let db!: DatabaseSync;
  let dishes: Dish[] = [];
  const set = loadRecipes(path.join(__dirname, '..', 'data', 'recipes'));
  beforeAll(() => {
    db = new DatabaseSync(BUILT, { readOnly: true });
    dishes = db
      .prepare(
        `SELECT f.id, f.source_id AS key, f.kcal_100g AS kcal, f.protein_100g AS protein, f.carbs_100g AS carbs, f.fat_100g AS fat,
                r.raw_grams AS raw, r.final_grams AS final, r.weight_rule AS rule, r.unknown_nutrients AS unknown
           FROM food f JOIN recipe r ON r.food_id = f.id ORDER BY f.id`,
      )
      .all()
      .map((r) => {
        const rows = db.prepare('SELECT nutrient_code, amount_100g FROM food_nutrient WHERE food_id = ?').all(Number(r.id));
        return {
          id: Number(r.id),
          key: String(r.key),
          kcal: Number(r.kcal),
          protein: Number(r.protein),
          carbs: Number(r.carbs),
          fat: Number(r.fat),
          nutrients: Object.fromEntries(rows.map((n) => [String(n.nutrient_code), Number(n.amount_100g)])),
          raw: Number(r.raw),
          final: Number(r.final),
          rule: String(r.rule),
          unknown: String(r.unknown).split(',').filter(Boolean),
        };
      });
  });
  afterAll(() => db.close());

  const energyOfComparables = (type: DishType): number[] =>
    COMPARABLES[type].map((name) => {
      const row = db.prepare(`SELECT f.kcal_100g AS kcal FROM food f JOIN food_name n ON n.food_id = f.id AND n.locale = 'en' AND n.is_alias = 0 WHERE n.name = ? AND f.source <> 'qbit_recipe'`).get(name);
      if (!row) throw new Error(`comparable food missing from the catalog: "${name}"`);
      return Number(row.kcal);
    });

  it('holds every recipe of the set, as foods of source qbit_recipe with ids in the range reserved for recipes, and no other food in it', () => {
    expect(dishes.length).toBe(set.recipes.length);
    expect(dishes.length).toBeGreaterThanOrEqual(40);
    expect(dishes.map((d) => d.key).sort()).toEqual(set.recipes.map((r) => r.key).sort());
    for (const d of dishes) expect([d.key, d.id - RECIPE_ID_BASE, isRecipeRef({ source: 'catalog', id: String(d.id) })]).toEqual([d.key, set.recipes.find((r) => r.key === d.key)!.id, true]);
    const others = db.prepare("SELECT count(*) AS n FROM food WHERE source <> 'qbit_recipe' AND id >= ?").get(RECIPE_ID_BASE);
    expect(Number(others!.n)).toBe(0);
    const meta = Object.fromEntries(db.prepare("SELECT key, value FROM catalog_meta WHERE key IN ('recipe_set_version', 'recipes', 'schema_version')").all().map((r) => [String(r.key), String(r.value)]));
    expect(meta).toEqual({ recipe_set_version: set.version, recipes: String(set.recipes.length), schema_version: '4' });
  });

  it('shows every dish under its own names: no qualifier was added to the Spanish name, and aliases exist in both languages', () => {
    for (const r of set.recipes) {
      const id = RECIPE_ID_BASE + r.id;
      const names = db.prepare('SELECT locale, name, is_alias FROM food_name WHERE food_id = ?').all(id).map((n) => ({ ...n }));
      expect([r.key, names.find((n) => n.locale === 'es' && !n.is_alias)?.name]).toEqual([r.key, r.nameEs]);
      expect([r.key, names.find((n) => n.locale === 'en' && !n.is_alias)?.name]).toEqual([r.key, r.nameEn]);
      for (const alias of r.aliasesEs ?? []) expect([r.key, names.some((n) => n.locale === 'es' && n.is_alias && n.name === alias)]).toEqual([r.key, true]);
      for (const alias of r.aliasesEn ?? []) expect([r.key, names.some((n) => n.locale === 'en' && n.is_alias && n.name === alias)]).toEqual([r.key, true]);
    }
  });

  it('keeps energy consistent with the macronutrients: |kcal - (4 protein + 4 carbs + 9 fat)| <= max(10 % of kcal, 8 kcal)', () => {
    // 95.4 % of the other 12,887 foods of the catalog meet the same rule (measured on the built catalog), so a dish that fails it is an outlier.
    const off = dishes.map((d) => ({ key: d.key, diff: Math.abs(d.kcal - (4 * d.protein + 4 * d.carbs + 9 * d.fat)), allowed: Math.max(0.1 * d.kcal, 8) })).filter((d) => d.diff > d.allowed);
    expect(off).toEqual([]);
  });

  it('keeps every value inside physical bounds', () => {
    for (const d of dishes) {
      for (const [code, value] of Object.entries(d.nutrients)) expect([d.key, code, Number.isFinite(value) && value >= 0]).toEqual([d.key, code, true]);
      // Macronutrients cannot weigh more than the food; energy cannot exceed that of pure fat.
      expect([d.key, d.protein + d.carbs + d.fat <= 100.5]).toEqual([d.key, true]);
      expect([d.key, d.kcal <= 902]).toEqual([d.key, true]);
      const n = d.nutrients;
      // USDA measures sugars and obtains carbohydrate by difference, so whole milk itself has more sugars (5.05) than carbohydrate (4.8) in SR Legacy.
      if (n.sugars !== undefined) expect([d.key, 'sugars <= carbs', n.sugars <= d.carbs * 1.1 + 0.2]).toEqual([d.key, 'sugars <= carbs', true]);
      if (n.fiber !== undefined) expect([d.key, 'fiber <= carbs', n.fiber <= d.carbs + 0.05]).toEqual([d.key, 'fiber <= carbs', true]);
      if (n.sat_fat !== undefined) expect([d.key, 'sat_fat <= fat', n.sat_fat <= d.fat + 0.05]).toEqual([d.key, 'sat_fat <= fat', true]);
      // The nutrients the recipe reports are exactly those that no significant ingredient lacks.
      expect([d.key, NUTRIENT_CODES.filter((c) => d.nutrients[c] === undefined).sort()]).toEqual([d.key, [...d.unknown].sort()]);
    }
  });

  it('keeps energy and the macronutrients at or below what the richest ingredient has once the weight lost in cooking is accounted for', () => {
    // A mixture cannot be richer than its richest ingredient, except by concentration: the dish weighs final/raw of what went in. Only these four are
    // checked per ingredient: the catalog may stand a twin of another source in for an ingredient, whose micronutrient values can differ.
    const ingredientMax = db.prepare(
      `SELECT MAX(fn.amount_100g) AS top FROM recipe_ingredient ri JOIN food_nutrient fn ON fn.food_id = ri.ingredient_food_id AND fn.nutrient_code = ? WHERE ri.food_id = ?`,
    );
    for (const d of dishes) {
      for (const code of ['kcal', 'protein', 'carbs', 'fat'] as const) {
        const top = Number(ingredientMax.get(code, d.id)?.top ?? 0);
        expect([d.key, code, (d.nutrients[code] as number) <= (top * d.raw) / d.final + 0.01]).toEqual([d.key, code, true]);
      }
      // And no value is beyond the highest one the catalog holds for that nutrient in any food.
      for (const [code, value] of Object.entries(d.nutrients)) {
        const top = Number(db.prepare("SELECT MAX(amount_100g) AS top FROM food_nutrient WHERE nutrient_code = ? AND food_id < ?").get(code, RECIPE_ID_BASE)!.top);
        expect([d.key, code, value <= top]).toEqual([d.key, code, true]);
      }
    }
  });

  it.each(Object.keys(COMPARABLES) as DishType[])('keeps the energy of every "%s" dish within the range of its comparable catalog foods, widened by 25 %%', (type) => {
    const kcal = energyOfComparables(type);
    expect(kcal.length).toBeGreaterThanOrEqual(3);
    const low = 0.75 * Math.min(...kcal);
    const high = 1.25 * Math.max(...kcal);
    const ofType = set.recipes.filter((r) => r.dishType === type);
    const outside = ofType.map((r) => ({ key: r.key, kcal: dishes.find((d) => d.key === r.key)!.kcal })).filter((d) => d.kcal < low || d.kcal > high);
    expect({ type, range: [low, high], outside }).toEqual({ type, range: [low, high], outside: [] });
  });

  it('keeps every dish type of the set covered by a comparable list, and every comparable list used', () => {
    expect([...new Set(set.recipes.map((r) => r.dishType))].sort()).toEqual(Object.keys(COMPARABLES).sort());
  });

  it('sums the weights correctly: raw = sum of the grams, and with the yields rule final = sum of grams x yield', () => {
    const lines = db.prepare('SELECT grams, yield_percent FROM recipe_ingredient WHERE food_id = ?');
    for (const d of dishes) {
      const rows = lines.all(d.id);
      const raw = rows.reduce((s, r) => s + Number(r.grams), 0);
      expect([d.key, Math.abs(raw - d.raw) < 0.001]).toEqual([d.key, true]);
      if (d.rule === 'yields') {
        const final = rows.reduce((s, r) => s + Number(r.grams) * (r.yield_percent === null ? 1 : Number(r.yield_percent) / 100), 0);
        expect([d.key, Math.abs(final - d.final) < 0.001]).toEqual([d.key, true]);
      } else {
        // Cooked down to a reference moisture, or declared: the finished dish is heavier than nothing and lighter than a few times the ingredients.
        expect([d.key, d.final > 0 && d.final <= 4 * d.raw]).toEqual([d.key, true]);
      }
    }
  });

  it('lists a household portion in each language, the first not heavier than the finished batch', () => {
    for (const r of set.recipes) {
      const id = RECIPE_ID_BASE + r.id;
      const final = dishes.find((d) => d.key === r.key)!.final;
      const portions = db.prepare('SELECT locale, grams FROM food_portion WHERE food_id = ?').all(id).map((p) => ({ locale: String(p.locale), grams: Number(p.grams) }));
      expect([r.key, portions.filter((p) => p.locale === 'en').length, portions.filter((p) => p.locale === 'es').length]).toEqual([r.key, r.portions.length, r.portions.length]);
      // The first measure is the dish as made; a larger measure ("large milanesa", "3 empanadas", "1 thermos" of mate) may weigh more, never more than eight times.
      expect([r.key, portions[0]!.grams <= final + 0.5]).toEqual([r.key, true]);
      for (const p of portions) expect([r.key, p.grams <= 8 * final]).toEqual([r.key, true]);
    }
  });

  it('is found by search under its own Spanish name in Spanish and its English name in English', async () => {
    const nodeDb = new NodeSqliteCatalogDb(BUILT);
    const catalog = createCatalog({ db: nodeDb, memory: new InMemoryMatchMemory() });
    const misses: string[] = [];
    for (const r of set.recipes) {
      const id = String(RECIPE_ID_BASE + r.id);
      if (!(await catalog.search(r.nameEs, 'es', 3)).some((f) => f.ref.id === id)) misses.push(`es:${r.nameEs}`);
      if (!(await catalog.search(r.nameEn, 'en', 3)).some((f) => f.ref.id === id)) misses.push(`en:${r.nameEn}`);
    }
    nodeDb.close();
    expect(misses).toEqual([]);
  });

  /**
   * Three recipes worked out by hand from the catalog's own ingredient values (docs/catalog-recipes.md section 6). The same numbers
   * are in recipeHandChecks.test.ts, which runs without a built catalog; here the built database must agree with them.
   */
  it('agrees with the hand-calculated milanesa, empanada and medialuna', () => {
    const one = (key: string) => dishes.find((d) => d.key === key)!;
    const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
    const mil = one('milanesa-carne-frita');
    expect([mil.kcal, mil.protein, mil.carbs, mil.fat].map((v) => Math.round(v * 100) / 100)).toEqual([256.0, 23.93, 12.74, 12.1]);
    expect(near(mil.nutrients.folate as number, 20.0262, 0.01) && near(mil.nutrients.vit_b12 as number, 1.2733, 0.01)).toBe(true);
    expect(near(mil.final, 142.4, 0.001)).toBe(true);
    const emp = one('empanada-carne-horno');
    expect([emp.kcal, emp.protein, emp.carbs, emp.fat].map((v) => Math.round(v * 10) / 10)).toEqual([277.9, 10.2, 23.2, 15.7]);
    expect(near(emp.final, 88.2478, 0.001)).toBe(true);
    const med = one('medialuna-manteca');
    expect(near(med.kcal, 402.27, 0.01) && near(med.final, 51.613, 0.001)).toBe(true);
  });
});
