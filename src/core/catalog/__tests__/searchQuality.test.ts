/** @jest-environment node */
/// <reference types="node" />
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildFixtureCatalog } from '../../../../scripts/catalog/testing/fixture';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from '../../../../scripts/catalog/nodeSqlitePort';
import { createCatalog } from '..';
import { indexFoods, measure, unsatisfiable } from '../testing/searchHarness';
import { FIXTURE_CASES, SEARCH_CASES } from '../testing/searchQueries';

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

  it('keeps top-1 accuracy at or above 88 % and top-3 at or above 94 % (measured 90.7 % and 96.3 % after T3; 75.8 % and 90.7 % before)', async () => {
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
