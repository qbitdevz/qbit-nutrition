/** @jest-environment node */
import { buildFixtureCatalog } from '../../../../scripts/catalog/testing/fixture';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from '../../../../scripts/catalog/nodeSqlitePort';
import { computeItemNutrients, sumNutrients } from '../../nutrition';
import { createCatalog, normalizeName, type Catalog, type MatchInput } from '..';

let db: NodeSqliteCatalogDb;
let memory: InMemoryMatchMemory;
let catalog: Catalog;

beforeAll(() => {
  db = new NodeSqliteCatalogDb(buildFixtureCatalog().dbPath);
});
afterAll(() => db.close());
beforeEach(() => {
  memory = new InMemoryMatchMemory();
  catalog = createCatalog({ db, memory });
});

const item = (over: Partial<MatchInput> & Pick<MatchInput, 'canonical_name_en'>): MatchInput => ({
  name: over.canonical_name_en,
  search_terms_en: [],
  preparation: 'unknown',
  ...over,
});

describe('search', () => {
  it('finds English names', async () => {
    const hits = await catalog.search('banana', 'en', 5);
    expect(hits[0]?.name).toBe('Bananas, raw');
  });

  it('finds Spanish names and returns them in the requested locale', async () => {
    const hits = await catalog.search('arroz blanco', 'es', 5);
    expect(hits[0]?.name).toBe('Arroz blanco, cocido');
    expect(hits[0]?.ref).toEqual({ source: 'catalog', id: '1002' });
  });

  it('ignores diacritics both ways: "platano" finds "plátano" and "plátano" finds it too', async () => {
    expect((await catalog.search('platano', 'es', 5))[0]?.name).toBe('Plátano, crudo');
    expect((await catalog.search('Plátano', 'es', 5))[0]?.name).toBe('Plátano, crudo');
  });

  it('finds Spanish aliases', async () => {
    expect((await catalog.search('jitomate', 'es', 5))[0]?.name).toBe('Tomate, crudo');
  });

  it('matches a prefix of the last word while typing', async () => {
    expect((await catalog.search('toma', 'es', 5))[0]?.name).toBe('Tomate, crudo');
  });

  it('keeps foods without a translation searchable in English, shown with their English name', async () => {
    const hits = await catalog.search('lentils', 'es', 5);
    expect(hits[0]?.name).toBe('Lentils, raw');
  });

  it('returns nothing for an empty query, a zero limit, or no hit, and survives FTS syntax characters', async () => {
    expect(await catalog.search('   ', 'en', 5)).toEqual([]);
    expect(await catalog.search('banana', 'en', 0)).toEqual([]);
    expect(await catalog.search('zzzzqqqq', 'en', 5)).toEqual([]);
    await expect(catalog.search('"banana" OR (NEAR', 'en', 5)).resolves.toBeDefined();
  });

  it('honors the limit', async () => {
    expect((await catalog.search('rice', 'en', 2)).length).toBe(2);
  });
});

describe('match', () => {
  it('prefers the entry in the same state as the preparation: a grilled item gets cooked, not raw', async () => {
    const [grilled] = await catalog.match([item({ canonical_name_en: 'chicken breast', preparation: 'grilled' })], 'en');
    expect(grilled?.kind).toBe('catalog');
    expect(grilled?.food?.ref).toEqual({ source: 'catalog', id: '1005' });
    expect(grilled?.food?.state).toBe('cooked');
    const raw = grilled?.alternatives.find((a) => a.food.ref.id === '1006');
    expect(raw).toBeDefined();
    expect(raw!.score).toBeLessThan(grilled!.score);
  });

  it('prefers the raw entry for a raw item', async () => {
    const [r] = await catalog.match([item({ canonical_name_en: 'chicken breast', preparation: 'raw' })], 'en');
    expect(r?.food?.ref.id).toBe('1006');
  });

  it('uses search terms and word order differences ("white rice, cooked")', async () => {
    const [r] = await catalog.match(
      [item({ canonical_name_en: 'white rice, cooked', search_terms_en: ['steamed rice'], preparation: 'boiled' })],
      'en',
    );
    expect(r?.food?.ref.id).toBe('1002');
  });

  it('returns the display name in the requested locale', async () => {
    const [r] = await catalog.match([item({ canonical_name_en: 'banana', preparation: 'raw' })], 'es');
    expect(r?.food?.name).toBe('Plátano, crudo');
  });

  it('prefers a generic entry over a branded one with the same name', async () => {
    const [r] = await catalog.match([item({ canonical_name_en: 'hamburger, plain' })], 'en');
    expect(r?.food?.ref.id).toBe('1008');
    expect(r?.food?.isBranded).toBe(false);
    const branded = r?.alternatives.find((a) => a.food.ref.id === '1007');
    expect(branded?.food.isBranded).toBe(true);
    expect(branded!.score).toBeLessThan(r!.score);
  });

  it('applies a remembered correction first, even over a better-scoring entry', async () => {
    const detected = item({ canonical_name_en: 'white rice, cooked', preparation: 'boiled' });
    expect((await catalog.match([detected], 'en'))[0]?.food?.ref.id).toBe('1002');

    await catalog.rememberCorrection('White rice, cooked', { source: 'catalog', id: '1004' });
    const [after] = await catalog.match([detected], 'en');
    expect(after?.kind).toBe('memory');
    expect(after?.ref).toEqual({ source: 'catalog', id: '1004' });
    expect(after?.food?.name).toBe('Rice, brown, long-grain, cooked');
    expect(after?.needsReview).toBe(false);
  });

  it('keys the memory by normalized name, so case, punctuation, and accents do not matter', async () => {
    await catalog.rememberCorrection('  PLÁTANO!! ', { source: 'catalog', id: '1004' });
    expect(await memory.get(normalizeName('platano'))).toEqual({ source: 'catalog', id: '1004' });
    const [r] = await catalog.match([item({ name: 'Plátano', canonical_name_en: 'banana', preparation: 'raw' })], 'es');
    expect(r?.kind).toBe('memory');
  });

  it('passes through remembered custom foods and ignores stale catalog refs', async () => {
    await catalog.rememberCorrection('banana', { source: 'custom', id: 'c-1' });
    const [custom] = await catalog.match([item({ canonical_name_en: 'banana', preparation: 'raw' })], 'en');
    expect(custom).toMatchObject({ kind: 'memory', ref: { source: 'custom', id: 'c-1' }, food: null });

    await catalog.rememberCorrection('banana', { source: 'catalog', id: '999999' });
    const [stale] = await catalog.match([item({ canonical_name_en: 'banana', preparation: 'raw' })], 'en');
    expect(stale?.kind).toBe('catalog');
    expect(stale?.food?.ref.id).toBe('1001');
  });

  it('falls back to the AI estimate, marked for review, when nothing passes the threshold', async () => {
    const fallback = { kcal: 150, protein_g: 6, carbs_g: 20, fat_g: 5 };
    const [r] = await catalog.match(
      [item({ canonical_name_en: 'dragon fruit smoothie bowl', search_terms_en: ['pitaya bowl'], fallback_per_100g: fallback })],
      'en',
    );
    expect(r).toMatchObject({ kind: 'ai_estimate', ref: null, food: null, needsReview: true, fallback_per_100g: fallback });
  });

  it('does not accept a weak partial overlap (one shared word out of three)', async () => {
    const [r] = await catalog.match([item({ canonical_name_en: 'chicken tikka masala', preparation: 'stewed' })], 'en');
    expect(r?.kind).toBe('ai_estimate');
    expect(r).toMatchObject({ fallback_per_100g: null });
  });

  it('respects a custom threshold', async () => {
    const strict = createCatalog({ db, memory, threshold: 1.01 });
    const [r] = await strict.match([item({ canonical_name_en: 'banana', preparation: 'raw' })], 'en');
    expect(r?.kind).toBe('ai_estimate');
  });

  it('matches several items in order', async () => {
    const out = await catalog.match(
      [item({ canonical_name_en: 'banana', preparation: 'raw' }), item({ canonical_name_en: 'unknown thing xyz' })],
      'en',
    );
    expect(out.map((r) => r.kind)).toEqual(['catalog', 'ai_estimate']);
  });
});

describe('getFood and nutrient math', () => {
  it('returns per-100 g nutrients and portions', async () => {
    const banana = await catalog.getFood({ source: 'catalog', id: '1001' });
    expect(banana.name).toBe('Bananas, raw');
    expect(banana.per100g).toEqual({ kcal: 89, protein: 1.09, carbs: 22.84, fat: 0.33, fiber: 2.6, sodium: 1 });
    expect(banana.portions).toEqual([{ locale: 'en', label: '1 medium (7" to 7-7/8" long)', grams: 118 }]);
    expect(banana.names.map((n) => n.name)).toEqual(expect.arrayContaining(['Bananas, raw', 'Plátano, crudo', 'banano']));
  });

  it('computes a meal from catalog values by hand-calculated amounts', async () => {
    const banana = await catalog.getFood({ source: 'catalog', id: '1001' });
    const rice = await catalog.getFood({ source: 'catalog', id: '1002' });
    // 118 g banana: 89 x 1.18 = 105.02 kcal, 1.09 x 1.18 = 1.2862 g protein, 2.6 x 1.18 = 3.068 g fiber.
    // 150 g cooked rice: 130 x 1.5 = 195 kcal, 2.69 x 1.5 = 4.035 g protein.
    const total = sumNutrients([computeItemNutrients(banana, 118), computeItemNutrients(rice, 150)]);
    expect(total.kcal).toBeCloseTo(300.02, 6);
    expect(total.protein).toBeCloseTo(5.3212, 6);
    expect(total.fiber).toBeCloseTo(3.068, 6); // only the banana reports fiber
  });

  it('rejects unknown ids and non-catalog sources', async () => {
    await expect(catalog.getFood({ source: 'catalog', id: '424242' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(catalog.getFood({ source: 'catalog', id: 'abc' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(catalog.getFood({ source: 'custom', id: 'x' })).rejects.toMatchObject({ code: 'unsupported_source' });
  });
});
