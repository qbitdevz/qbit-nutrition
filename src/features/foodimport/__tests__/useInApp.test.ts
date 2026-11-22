/** @jest-environment node */
import { DEFAULT_MATCH_THRESHOLD, type MatchInput } from '@/core/catalog';
import { createHarness, type Harness } from '@/data/testing/harness';
import { createTestServices } from '../../testing/testServices';
import { loadFoodView, loadUsage, rowFromView, searchFoods, SEARCH_LIMIT } from '../../logging/foods';
import { IMPORTED_RESULT_LIMIT } from '../importedSearch';
import { withImportedMatching } from '../importedMatch';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
});
afterEach(() => {
  services.close();
  h.close();
});

const importTable = (name: string, foods: { name: string; per100g: Record<string, number> }[], basis: 'g' | 'ml' = 'g') =>
  h.repos.importedFoods.importCollection({ name, basis }, foods);

describe('imported foods in search (S1, S5)', () => {
  it('finds an imported food with and without accents, with a tag naming its table', async () => {
    await importTable('Mi tabla', [{ name: 'Plátano de ejemplo', per100g: { kcal: 89, protein: 1.1 } }]);
    for (const q of ['platano', 'plátano', 'PLATANOS', 'plat']) {
      const rows = await searchFoods(services, q, 'es');
      const row = rows.find((r) => r.name === 'Plátano de ejemplo');
      expect(row).toMatchObject({ imported: { collection: 'Mi tabla', basis: 'g' }, custom: false, kcal100g: 89, protein100g: 1.1 });
      expect(row!.ref.source).toBe('custom');
    }
  });

  it('shows what the table did not have as unknown, never as zero', async () => {
    await importTable('Mi tabla', [{ name: 'Alimento incompleto', per100g: { kcal: 50 } }]);
    const row = (await searchFoods(services, 'incompleto', 'es'))[0]!;
    expect(row.missing).toEqual(['protein', 'carbs', 'fat']);
    expect(row.kcal100g).toBe(50);
  });

  it('opens in the portion sheet from the imported values, with its origin', async () => {
    await importTable('Bebidas', [{ name: 'Jugo inventado', per100g: { kcal: 45, sugars: 10 } }], 'ml');
    const row = (await searchFoods(services, 'jugo', 'en'))[0]!;
    const view = await loadFoodView(services, row.ref, 'en');
    expect(view).toMatchObject({ name: 'Jugo inventado', per100g: { kcal: 45, sugars: 10 }, imported: { collection: 'Bebidas', basis: 'ml' } });
    expect(rowFromView(view!)).toMatchObject({ imported: { collection: 'Bebidas' }, custom: false });
  });

  it('can be favorited and shows up in favorites and recents like any food', async () => {
    await importTable('Mi tabla', [{ name: 'Lenteja de ejemplo', per100g: { kcal: 116 } }]);
    const row = (await searchFoods(services, 'lenteja', 'es'))[0]!;
    await services.repos.foodUsage.setFavorite(row.ref, true);
    await services.repos.foodUsage.recordUse(row.ref, 150);
    const usage = await loadUsage(services, 'es');
    expect(usage.favorites.map((f) => [f.name, f.imported?.collection])).toEqual([['Lenteja de ejemplo', 'Mi tabla']]);
    expect(usage.lastGrams.get(`custom:${row.ref.id}`)).toBe(150);
  });

  it('a food of a removed table disappears from favorites instead of failing', async () => {
    const t = await importTable('Mi tabla', [{ name: 'Lenteja de ejemplo', per100g: { kcal: 116 } }]);
    const row = (await searchFoods(services, 'lenteja', 'es'))[0]!;
    await services.repos.foodUsage.setFavorite(row.ref, true);
    await h.repos.importedFoods.removeCollection(t.id);
    expect((await loadUsage(services, 'es')).favorites).toEqual([]);
    expect(await loadFoodView(services, row.ref, 'es')).toBeNull();
  });
});

describe('ranking imported next to catalog foods', () => {
  /** The fixture catalog has "Rice, white, long-grain, regular, cooked" (id 1003 or so) and a banana. */
  const thousand = Array.from({ length: 1000 }, (_, i) => ({ name: `Rice, mixed dish number ${i}`, per100g: { kcal: 100 + (i % 50) } }));

  it('RULE: both kinds are scored on the catalog scale and merged by score; a tie goes to the catalog', async () => {
    await importTable('Mi tabla', [{ name: 'Banana', per100g: { kcal: 90 } }]);
    const rows = await searchFoods(services, 'banana', 'en');
    const sources = rows.map((r) => (r.imported ? 'imported' : 'catalog'));
    // The same name scores the same on both sides: the catalog food comes first, then the imported one.
    expect(sources.slice(0, 2)).toEqual(['catalog', 'imported']);
  });

  it('RULE: an exact imported match outranks a loose catalog match', async () => {
    await importTable('Mi tabla', [{ name: 'Rice', per100g: { kcal: 130 } }]);
    const rows = await searchFoods(services, 'rice', 'en');
    expect(rows[0]).toMatchObject({ name: 'Rice', imported: { collection: 'Mi tabla' } });
  });

  it('RULE: thousands of imported foods never bury the catalog: at most 15 are shown, and every catalog result is still there', async () => {
    const catalogOnly = await searchFoods(services, 'rice', 'en');
    await importTable('Gigante', thousand);
    const withImport = await searchFoods(services, 'rice', 'en');
    const imported = withImport.filter((r) => r.imported);
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.length).toBeLessThanOrEqual(IMPORTED_RESULT_LIMIT);
    expect(withImport.filter((r) => !r.imported).map((r) => r.name)).toEqual(catalogOnly.filter((r) => !r.custom).map((r) => r.name));
    expect(withImport.length).toBeLessThanOrEqual(SEARCH_LIMIT + IMPORTED_RESULT_LIMIT + 10);
    // The catalog's best rice stays above the loose imported ones.
    expect(withImport[0]!.imported).toBeUndefined();
  });

  it('RULE: the catalog never buries imported foods either: an exact imported name is shown whatever the catalog holds', async () => {
    await importTable('Mi tabla', [...thousand, { name: 'Arroz yamaní', per100g: { kcal: 123 } }]);
    const rows = await searchFoods(services, 'arroz yamani', 'es');
    expect(rows[0]).toMatchObject({ name: 'Arroz yamaní', imported: { collection: 'Mi tabla' } });
  });

  it("a person's own custom foods still come first", async () => {
    await h.repos.customFoods.create({ name: 'Rice mine', kcal100g: 1, protein100g: 1, carbs100g: 1, fat100g: 1 });
    await importTable('Mi tabla', [{ name: 'Rice', per100g: { kcal: 130 } }]);
    expect((await searchFoods(services, 'rice', 'en'))[0]).toMatchObject({ name: 'Rice mine', custom: true });
  });
});

describe('the AI scan matcher and imported foods', () => {
  const item = (over: Partial<MatchInput> = {}): MatchInput => ({ name: 'arroz amarillo', canonical_name_en: 'yellow rice', search_terms_en: ['arroz amarillo'], preparation: 'unknown', ...over });
  const cheddar = item({ name: 'cheddar', canonical_name_en: 'cheddar cheese', search_terms_en: [] });

  it('matches an imported food when the catalog has nothing for it', async () => {
    await importTable('Mi tabla', [{ name: 'Arroz amarillo', per100g: { kcal: 140 } }]);
    const [result] = await services.catalog.match([item()], 'es');
    expect(result).toMatchObject({ kind: 'catalog', ref: { source: 'custom' }, food: { name: 'Arroz amarillo' } });
    expect(result!.score).toBeGreaterThanOrEqual(DEFAULT_MATCH_THRESHOLD);
  });

  it('RULE: an imported food wins only with a strictly higher score than the best catalog food, and above the threshold', async () => {
    const asked = item({ name: 'rice', canonical_name_en: 'rice', search_terms_en: [] });
    const [before] = await services.catalog.match([asked], 'en');
    expect(before).toMatchObject({ kind: 'catalog', ref: { source: 'catalog' } });
    await importTable('Mi tabla', [{ name: 'Rice', per100g: { kcal: 130 } }]);
    const [after] = await services.catalog.match([asked], 'en');
    expect(after).toMatchObject({ kind: 'catalog', ref: { source: 'custom' } });
    expect(after!.score).toBeGreaterThan(before!.score);
  });

  it('RULE: on a tie the catalog keeps the match', async () => {
    const asked = item({ name: 'banana', canonical_name_en: 'banana', search_terms_en: [] });
    const [before] = await services.catalog.match([asked], 'en');
    await importTable('Mi tabla', [{ name: 'Banana', per100g: { kcal: 90 } }]);
    const [after] = await services.catalog.match([asked], 'en');
    expect(after).toEqual(before);
    expect(after).toMatchObject({ ref: { source: 'catalog' } });
  });

  it('leaves the catalog result alone when no imported food reaches the threshold', async () => {
    const [before] = await services.catalog.match([cheddar], 'en');
    await importTable('Mi tabla', [{ name: 'Arroz amarillo', per100g: { kcal: 140 } }]);
    expect((await services.catalog.match([cheddar], 'en'))[0]).toEqual(before);
  });

  it('keeps a learned correction first: memory beats both', async () => {
    await importTable('Mi tabla', [{ name: 'Arroz amarillo', per100g: { kcal: 140 } }]);
    const [food] = await h.repos.importedFoods.search('arroz', 1);
    await services.catalog.rememberCorrection('arroz amarillo', { source: 'custom', id: food!.id });
    const [result] = await services.catalog.match([item()], 'es');
    expect(result).toMatchObject({ kind: 'memory', ref: { source: 'custom', id: food!.id } });
  });

  it('works without any imported table', async () => {
    expect((await services.catalog.match([cheddar], 'en'))[0]!.kind).toBe('catalog');
    expect(withImportedMatching).toBeInstanceOf(Function);
  });
});
