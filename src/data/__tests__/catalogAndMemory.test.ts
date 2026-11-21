/** @jest-environment node */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCatalog, normalizeName, type CatalogDb, type MatchMemory } from '../../core/catalog';
import { createSqliteCatalogDb } from '../catalog/sqliteCatalogDb';
import { createMatchMemoryRepository } from '../repositories/matchMemory';
import { createHarness, fixtureCatalogFile, nodeCatalogClient, type Harness } from '../testing/harness';

describe('CatalogDb over the fixture catalog (the port the app implements with expo-sqlite)', () => {
  const client = nodeCatalogClient(fixtureCatalogFile());
  const db: CatalogDb = createSqliteCatalogDb(client);
  afterAll(() => client.close());

  it('returns plain rows for a query with parameters', async () => {
    const rows = await db.all('SELECT id, kcal_100g FROM food WHERE id = ?', [1001]);
    expect(rows).toEqual([{ id: 1001, kcal_100g: 89 }]);
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
  });

  it('works without parameters and returns no rows for no match', async () => {
    expect((await db.all('SELECT count(*) AS n FROM nutrient'))[0]?.n).toBeGreaterThan(10);
    expect(await db.all('SELECT * FROM food WHERE id = ?', [-1])).toEqual([]);
  });

  it('supports FTS5 with diacritics removed', async () => {
    const rows = await db.all(
      `SELECT fn.food_id AS food_id FROM food_fts JOIN food_name fn ON fn.rowid = food_fts.rowid WHERE food_fts MATCH ?`,
      ['"platano"'],
    );
    expect(rows.map((r) => r.food_id)).toContain(1001);
  });

  it('serves core/catalog search, getFood and portions', async () => {
    const catalog = createCatalog({ db, memory: { get: async () => null, remember: async () => {} } });
    expect((await catalog.search('platano', 'es', 3))[0]?.name).toBe('Plátano, crudo');
    const banana = await catalog.getFood({ source: 'catalog', id: '1001' });
    expect(banana.per100g).toMatchObject({ kcal: 89, fiber: 2.6 });
    expect(banana.portions[0]?.grams).toBe(118);
  });

  it('rejects a write (the catalog is read-only)', async () => {
    await expect(db.all('DELETE FROM food WHERE id = 1001')).rejects.toThrow();
  });
});

describe('match memory through the core MatchMemory port', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.close());

  it('returns null for a name it has never seen', async () => {
    const memory: MatchMemory = h.repos.matchMemory;
    expect(await memory.get('banano')).toBeNull();
  });

  it('remembers a correction and gives the same FoodRef back', async () => {
    const memory: MatchMemory = h.repos.matchMemory;
    await memory.remember('banano', { source: 'custom', id: 'abc' });
    expect(await memory.get('banano')).toEqual({ source: 'custom', id: 'abc' });
  });

  it('counts confirmations of the same food and restarts the count when the food changes', async () => {
    const m = h.repos.matchMemory;
    await m.remember('banano', { source: 'catalog', id: '1001' });
    await m.remember('banano', { source: 'catalog', id: '1001' });
    expect(await m.getEntry('banano')).toMatchObject({ timesConfirmed: 2, ref: { source: 'catalog', id: '1001' } });
    h.setNow('2026-06-16T00:00:00.000Z');
    await m.remember('banano', { source: 'catalog', id: '1004' });
    expect(await m.getEntry('banano')).toMatchObject({ timesConfirmed: 1, ref: { source: 'catalog', id: '1004' }, updatedAt: '2026-06-16T00:00:00.000Z' });
  });

  it('is what core/catalog uses: a correction changes later matches', async () => {
    const detected = { name: 'Plátano maduro', canonical_name_en: 'ripe plantain thing', search_terms_en: [], preparation: 'unknown' as const };
    const before = await h.catalog.match([detected], 'es');
    expect(before[0]?.kind).not.toBe('memory');

    await h.catalog.rememberCorrection('Plátano maduro', { source: 'catalog', id: '1001' });
    expect(await h.repos.matchMemory.get(normalizeName('Plátano maduro'))).toEqual({ source: 'catalog', id: '1001' });

    const after = await h.catalog.match([detected], 'es');
    expect(after[0]).toMatchObject({ kind: 'memory', ref: { source: 'catalog', id: '1001' } });
    expect(after[0]?.food?.name).toBe('Plátano, crudo');
  });

  it('survives closing and reopening app.db', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'qn-mm-')), 'app.db');
    const first = await createHarness({ file });
    await first.repos.matchMemory.remember('arroz', { source: 'catalog', id: '1002' });
    first.close();

    const second = await createHarness({ file });
    expect(await second.repos.matchMemory.get('arroz')).toEqual({ source: 'catalog', id: '1002' });
    second.close();
  });

  it('can be built on its own from a database', async () => {
    const memory = createMatchMemoryRepository({ db: h.db, now: () => new Date('2026-06-15T00:00:00Z') });
    await memory.remember('x', { source: 'barcode', id: '7501' });
    expect(await h.repos.matchMemory.get('x')).toEqual({ source: 'barcode', id: '7501' });
  });
});
