/** @jest-environment node */
import { buildFixtureCatalog, FIXTURE_RECIPE } from '../../../../scripts/catalog/testing/fixture';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from '../../../../scripts/catalog/nodeSqlitePort';
import { createCatalog, isRecipeRef, RECIPE_ID_BASE, type Catalog, type FoodRef } from '..';

/** Recipe-calculated foods in the catalog port (odd/tasks/catalog-expansion.md T4, S8). */
let db: NodeSqliteCatalogDb;
let catalog: Catalog;
const recipeRef: FoodRef = { source: 'catalog', id: String(RECIPE_ID_BASE + FIXTURE_RECIPE.id) };

beforeAll(() => {
  db = new NodeSqliteCatalogDb(buildFixtureCatalog({ recipes: true }).dbPath);
  catalog = createCatalog({ db, memory: new InMemoryMatchMemory() });
});
afterAll(() => db.close());

describe('isRecipeRef', () => {
  it('is true only for catalog foods in the id range reserved for recipes', () => {
    expect(isRecipeRef(recipeRef)).toBe(true);
    expect(isRecipeRef({ source: 'catalog', id: String(RECIPE_ID_BASE) })).toBe(true);
    expect(isRecipeRef({ source: 'catalog', id: String(RECIPE_ID_BASE - 1) })).toBe(false);
    expect(isRecipeRef({ source: 'catalog', id: '2708711' })).toBe(false);
  });

  it('is false for custom foods, barcode products, and ids that are not numbers, even in the range', () => {
    expect(isRecipeRef({ source: 'custom', id: String(RECIPE_ID_BASE + 1) })).toBe(false);
    expect(isRecipeRef({ source: 'barcode', id: String(RECIPE_ID_BASE + 1) })).toBe(false);
    expect(isRecipeRef({ source: 'catalog', id: 'abc' })).toBe(false);
    expect(isRecipeRef({ source: 'catalog', id: `${RECIPE_ID_BASE}x` })).toBe(false);
  });
});

describe('recipe foods in search and detail', () => {
  it('are found by their names and aliases in both languages, and their ref is a recipe ref', async () => {
    const es = await catalog.search('arroz con pollo', 'es', 5);
    expect(es[0]).toMatchObject({ name: 'Arroz con pollo casero', ref: recipeRef, state: 'cooked', isBranded: false });
    expect((await catalog.search('chicken and rice', 'en', 5))[0]?.ref).toEqual(recipeRef);
    expect(isRecipeRef(es[0]!.ref)).toBe(true);
  });

  it('returns the calculated values and the household portion in both languages', async () => {
    const detail = await catalog.getFood(recipeRef);
    // 150 g raw chicken breast (120 kcal / 100 g) at 72 % yield = 108 g; 200 g rice (130 kcal / 100 g). kcal = 180 + 260 = 440 over 308 g = 142.857.
    expect(detail.per100g.kcal).toBeCloseTo(142.857, 2);
    expect(detail.portions).toEqual([
      { locale: 'en', label: '1 plate', grams: 300 },
      { locale: 'es', label: '1 plato', grams: 300 },
    ]);
  });
});

describe('getRecipe', () => {
  it('returns the method in the requested language: ingredient names, grams, yield, weights, sources, version', async () => {
    const es = await catalog.getRecipe(recipeRef, 'es');
    expect(es).toMatchObject({
      ref: recipeRef,
      version: 'fixture-recipes@1',
      preparation: 'Asar el pollo y servirlo sobre el arroz.',
      basis: 'Una preparación casera escrita para las pruebas.',
      rawGrams: 350,
      finalGrams: 308,
    });
    expect(es!.ingredients).toEqual([
      { name: 'Chicken, breast, meat only, raw', grams: 150, yieldPercent: 72, absorbed: false },
      { name: 'Arroz blanco, cocido', grams: 200, yieldPercent: null, absorbed: false },
    ]);
    expect(es!.factorSources).toEqual(['Fixture yield table: 5060, Baked or Roasted, unspecified, 72 %']);
    expect(es!.unknownNutrients).toContain('vit_d');
    const en = await catalog.getRecipe(recipeRef, 'en');
    expect(en!.preparation).toBe('Roast the chicken and serve it on the rice.');
    expect(en!.ingredients[1]!.name).toBe('Rice, white, long-grain, regular, cooked');
  });

  it('is null for a catalog food that is not a recipe, a food that does not exist, and other food sources', async () => {
    expect(await catalog.getRecipe({ source: 'catalog', id: '1002' }, 'en')).toBeNull();
    expect(await catalog.getRecipe({ source: 'catalog', id: String(RECIPE_ID_BASE + 99) }, 'en')).toBeNull();
    expect(await catalog.getRecipe({ source: 'custom', id: 'c-1' }, 'en')).toBeNull();
    expect(await catalog.getRecipe({ source: 'catalog', id: 'nope' }, 'en')).toBeNull();
  });
});
