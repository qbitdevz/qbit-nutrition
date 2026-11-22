/** @jest-environment node */
/// <reference types="node" />
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildFixtureCatalog } from '../../../../scripts/catalog/testing/fixture';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from '../../../../scripts/catalog/nodeSqlitePort';
import { createCatalog } from '..';
import { indexFoods, measure, unsatisfiable } from '../testing/searchHarness';
import { FIXTURE_CASES, ORIGINAL_CASES, RECIPE_CASES, SEARCH_CASES } from '../testing/searchQueries';

/**
 * Search quality over everyday queries in English and Spanish (odd/tasks/catalog-expansion.md T3, S6). The full set runs
 * against the real built catalog when `catalog-build/catalog.db` exists; CI does not build it, so that block is skipped
 * there (its name says why). A reduced set always runs against the fixture catalog.
 */
const BUILT = path.join(__dirname, '..', '..', '..', '..', 'catalog-build', 'catalog.db');

describe('search quality, fixture catalog (always runs)', () => {
  const fixture = buildFixtureCatalog();
  const db = new NodeSqliteCatalogDb(fixture.dbPath);
  afterAll(() => db.close());

  it('puts an acceptable food first for every query of the reduced set', async () => {
    const index = await indexFoods(db);
    expect(unsatisfiable(index, FIXTURE_CASES)).toEqual([]);
    const acc = await measure(createCatalog({ db, memory: new InMemoryMatchMemory() }), index, FIXTURE_CASES);
    const misses = acc.results.filter((r) => r.rank !== 1).map((r) => `${r.case.locale}:${r.case.q} -> ${r.top.join(' | ')}`);
    expect(misses).toEqual([]);
    expect(acc.total).toBeGreaterThanOrEqual(14);
  });
});

const describeBuilt = existsSync(BUILT) ? describe : describe.skip;
const label = existsSync(BUILT)
  ? 'search quality, built catalog'
  : 'search quality, built catalog (SKIPPED: catalog-build/catalog.db not found; run "npm run catalog:build" to measure the real catalog)';

describeBuilt(label, () => {
  // Opened in beforeAll: a skipped describe still runs its body, and CI has no built catalog to open.
  let db!: NodeSqliteCatalogDb;
  beforeAll(() => {
    db = new NodeSqliteCatalogDb(BUILT);
  });
  afterAll(() => db.close());

  it('has at least 150 everyday queries, half English and half Spanish, each satisfiable by some food', async () => {
    expect(SEARCH_CASES.length).toBeGreaterThanOrEqual(150);
    const en = SEARCH_CASES.filter((c) => c.locale === 'en').length;
    expect(Math.abs(en - (SEARCH_CASES.length - en))).toBeLessThanOrEqual(10);
    expect(unsatisfiable(await indexFoods(db), SEARCH_CASES).map((c) => `${c.locale}:${c.q}`)).toEqual([]);
  });

  it('answers the known failures of the owner report first (S6)', async () => {
    const index = await indexFoods(db);
    const known = SEARCH_CASES.filter((c) => c.note?.startsWith('S6'));
    expect(known.map((c) => c.q)).toEqual(['white rice, cooked', 'french fries', 'arroz blanco cocido', 'pechuga de pollo']);
    const acc = await measure(createCatalog({ db, memory: new InMemoryMatchMemory() }), index, known);
    expect(acc.results.map((r) => [r.case.q, r.rank])).toEqual(known.map((c) => [c.q, 1]));
  });

  it('keeps the accuracy of the original 226 queries where it was before the recipe dishes were added (92.0 % top-1, 97.8 % top-3)', async () => {
    const index = await indexFoods(db);
    const acc = await measure(createCatalog({ db, memory: new InMemoryMatchMemory() }), index, ORIGINAL_CASES);
    expect(acc.total).toBe(226);
    expect(acc.top1 / acc.total).toBeGreaterThanOrEqual(0.92);
    expect(acc.top3 / acc.total).toBeGreaterThanOrEqual(0.977);
  });

  it('puts a recipe-calculated dish first for at least 95 % of the dish queries and in the top 3 for all of them, in both languages (measured 98.8 % and 100 %)', async () => {
    const index = await indexFoods(db);
    const acc = await measure(createCatalog({ db, memory: new InMemoryMatchMemory() }), index, RECIPE_CASES);
    expect(RECIPE_CASES.filter((c) => c.locale === 'en').length).toBeGreaterThanOrEqual(30);
    expect(RECIPE_CASES.filter((c) => c.locale === 'es').length).toBeGreaterThanOrEqual(30);
    expect(acc.top1 / acc.total).toBeGreaterThanOrEqual(0.95);
    expect(acc.top3).toBe(acc.total);
  });

  it('keeps top-1 accuracy at or above 88 % and top-3 at or above 94 % over all queries (measured 93.8 % and 98.4 % with the recipe dishes; 92.0 % and 97.8 % on the original 226 before them; 75.8 % and 90.7 % before T3)', async () => {
    const index = await indexFoods(db);
    const acc = await measure(createCatalog({ db, memory: new InMemoryMatchMemory() }), index, SEARCH_CASES);
    const failed = acc.results.filter((r) => r.rank !== 1).map((r) => `${r.rank ?? 'miss'} ${r.case.locale}:${r.case.q}`);
    expect({ top1: acc.top1 / acc.total >= 0.88, top3: acc.top3 / acc.total >= 0.94, failed: failed.length > 0 ? failed : [] }).toEqual({
      top1: true,
      top3: true,
      failed: expect.any(Array),
    });
  });
});
