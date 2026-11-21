/** @jest-environment node */
import { sql } from 'drizzle-orm';

import type { BarcodeProductRecord } from '../repositories';
import { expectDataError } from '../testing/expectations';
import { createHarness, type Harness } from '../testing/harness';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const NUTELLA: BarcodeProductRecord = {
  barcode: '3017624010701',
  name: 'Nutella',
  brand: 'Ferrero',
  per100g: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sugars: 56.3, sodium: 43 },
  servingG: 15,
  missing: [],
  inconsistent: false,
  edited: false,
  fetchedAt: '2026-06-01T10:00:00.000Z',
};

const rows = (table: string) => h.client.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];

describe('BarcodeProductRepository', () => {
  it('stores a product with its fetch time and reads it back unchanged', async () => {
    expect(await h.repos.barcodeProducts.get(NUTELLA.barcode)).toBeNull();
    await h.repos.barcodeProducts.put(NUTELLA);
    expect(await h.repos.barcodeProducts.get(NUTELLA.barcode)).toEqual(NUTELLA);
    // The four headline values are columns; the other nutrients are JSON; fetched_at is kept as given.
    expect(rows('barcode_product')[0]).toMatchObject({ barcode: '3017624010701', kcal_100g: 539, serving_g: 15, fetched_at: '2026-06-01T10:00:00.000Z' });
  });

  it('replaces the row for the same barcode when it is stored again (a refresh)', async () => {
    await h.repos.barcodeProducts.put(NUTELLA);
    await h.repos.barcodeProducts.put({ ...NUTELLA, per100g: { ...NUTELLA.per100g, kcal: 540 }, fetchedAt: '2026-07-01T10:00:00.000Z' });
    expect(rows('barcode_product')).toHaveLength(1);
    expect(await h.repos.barcodeProducts.get(NUTELLA.barcode)).toMatchObject({ per100g: expect.objectContaining({ kcal: 540 }), fetchedAt: '2026-07-01T10:00:00.000Z' });
  });

  it('keeps an incomplete product incomplete: a missing value is still missing after a round trip, never 0', async () => {
    const incomplete: BarcodeProductRecord = { ...NUTELLA, barcode: '96385074', name: '', per100g: { protein: 3 }, servingG: null, brand: null, missing: ['name', 'kcal', 'carbs', 'fat'] };
    await h.repos.barcodeProducts.put(incomplete);
    const back = await h.repos.barcodeProducts.get('96385074');
    expect(back).toEqual(incomplete);
    expect(back!.per100g.kcal).toBeUndefined();
  });

  it('remembers that a product was flagged as inconsistent, and that the person edited it', async () => {
    await h.repos.barcodeProducts.put({ ...NUTELLA, inconsistent: true });
    expect((await h.repos.barcodeProducts.get(NUTELLA.barcode))!.inconsistent).toBe(true);
    await h.repos.barcodeProducts.put({ ...NUTELLA, edited: true });
    expect((await h.repos.barcodeProducts.get(NUTELLA.barcode))!).toMatchObject({ edited: true, inconsistent: false });
  });

  it('reads a row written without metadata (an older build, a manual insert) as a complete product', async () => {
    h.client.exec(`INSERT INTO barcode_product (barcode, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fetched_at) VALUES ('7501', 'Galletas', 450, 6, 70, 16, '2026-01-01T00:00:00.000Z')`);
    expect(await h.repos.barcodeProducts.get('7501')).toEqual({
      barcode: '7501', name: 'Galletas', brand: null, per100g: { kcal: 450, protein: 6, carbs: 70, fat: 16 }, servingG: null, missing: [], inconsistent: false, edited: false, fetchedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it.each([
    ['a barcode that is not digits', { barcode: '12ab' }],
    ['a negative value', { per100g: { kcal: -1 } }],
    ['a value that is not finite', { per100g: { kcal: Number.POSITIVE_INFINITY } }],
    ['an unknown nutrient', { per100g: { kcal: 1, zzz: 2 } }],
    ['a name that is far too long', { name: 'x'.repeat(5000) }],
    ['a serving of zero grams', { servingG: 0 }],
    ['a fetch time that is not a timestamp', { fetchedAt: 'yesterday' }],
  ])('refuses %s', async (_label, patch) => {
    await expectDataError(h.repos.barcodeProducts.put({ ...NUTELLA, ...(patch as object) } as never), 'invalid_input');
    expect(rows('barcode_product')).toHaveLength(0);
  });
});

describe('a saved barcode item', () => {
  const save = (grams: number, nutrients: Record<string, number>) =>
    h.repos.meals.save({
      eatenAt: new Date('2026-06-15T12:00:00.000Z'),
      timeZone: 'UTC',
      slot: 'snack',
      source: 'manual',
      items: [{ displayName: 'Nutella', grams, foodSource: 'barcode', foodRef: NUTELLA.barcode, origin: 'manual', nutrients }],
    });

  it('keeps its own snapshot, shows in recents, and is recalculated from the product when its grams change', async () => {
    await h.repos.barcodeProducts.put(NUTELLA);
    const meal = await save(30, { kcal: 161.7, protein: 1.89, carbs: 17.25, fat: 9.27 });
    expect(meal.items[0]).toMatchObject({ foodSource: 'barcode', foodRef: NUTELLA.barcode, kcal: 161.7 });
    expect((await h.repos.foodUsage.recents(5)).map((r) => [r.foodSource, r.foodRef])).toEqual([['barcode', NUTELLA.barcode]]);

    const edited = await h.repos.meals.updateItemGrams(meal.items[0]!.id, 100);
    expect(edited).toMatchObject({ kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9 });
    expect(edited.nutrients).toMatchObject({ sugars: 56.3, sodium: 43 });
  });

  it('can be a favorite', async () => {
    await h.repos.barcodeProducts.put(NUTELLA);
    await h.repos.foodUsage.setFavorite({ source: 'barcode', id: NUTELLA.barcode }, true);
    expect((await h.repos.foodUsage.favorites()).map((f) => f.foodRef)).toEqual([NUTELLA.barcode]);
  });

  it('is not recalculated from a product whose values are missing: the proportion of its snapshot is used instead', async () => {
    await h.repos.barcodeProducts.put({ ...NUTELLA, per100g: { protein: 6.3 }, missing: ['kcal', 'carbs', 'fat'] });
    const meal = await save(30, { kcal: 100, protein: 2, carbs: 10, fat: 3 });
    const edited = await h.repos.meals.updateItemGrams(meal.items[0]!.id, 60);
    expect(edited).toMatchObject({ kcal: 200, proteinG: 4, carbsG: 20, fatG: 6 });
  });
});

describe('barcode products in a backup', () => {
  const insertUnreferenced = () => h.repos.barcodeProducts.put({ ...NUTELLA, barcode: '4006381333931', name: 'Unused', fetchedAt: '2026-06-02T10:00:00.000Z' });

  it('includes a product that a saved item, a favorite, a recent, or a learned match refers to, and nothing else', async () => {
    const codes = ['3017624010701', '4006381333931', '8076800195057', '5449000000996', '3560070048786'];
    for (const barcode of codes) await h.repos.barcodeProducts.put({ ...NUTELLA, barcode, name: barcode });
    // item
    await h.repos.meals.save({
      eatenAt: new Date('2026-06-15T12:00:00.000Z'), timeZone: 'UTC', slot: 'lunch', source: 'manual',
      items: [{ displayName: 'a', grams: 10, foodSource: 'barcode', foodRef: codes[0]!, origin: 'manual', nutrients: { kcal: 1, protein: 1, carbs: 1, fat: 1 } }],
    });
    await h.repos.foodUsage.setFavorite({ source: 'barcode', id: codes[1]! }, true); // favorite only
    await h.repos.foodUsage.recordUse({ source: 'barcode', id: codes[2]! }, 50); // recent only
    await h.repos.matchMemory.remember('fanta', { source: 'barcode', id: codes[3]! }); // learned match
    // codes[4] is only in the cache

    const snapshot = await h.repos.backup.read();
    expect(snapshot.barcodeProducts.map((p) => p.barcode).sort()).toEqual(codes.slice(0, 4).sort());
  });

  it('is empty when no product is referenced', async () => {
    await insertUnreferenced();
    expect((await h.repos.backup.read()).barcodeProducts).toEqual([]);
  });

  it('restores the products with the rest, so nothing dangles, and removes the cache it replaces', async () => {
    await h.repos.barcodeProducts.put(NUTELLA);
    await h.repos.barcodeProducts.put({ ...NUTELLA, barcode: '96385074', name: '', per100g: {}, servingG: null, missing: ['name', 'kcal', 'protein', 'carbs', 'fat'] });
    await h.repos.foodUsage.recordUse({ source: 'barcode', id: NUTELLA.barcode }, 30);
    await h.repos.foodUsage.recordUse({ source: 'barcode', id: '96385074' }, 30);
    const snapshot = await h.repos.backup.read();

    const other = await createHarness();
    try {
      await other.repos.barcodeProducts.put({ ...NUTELLA, barcode: '5449000000996', name: 'Old cache' });
      await other.repos.backup.replaceAll(snapshot);
      expect(await other.repos.barcodeProducts.get(NUTELLA.barcode)).toEqual(NUTELLA);
      expect((await other.repos.barcodeProducts.get('96385074'))!.missing).toEqual(['name', 'kcal', 'protein', 'carbs', 'fat']);
      expect(await other.repos.barcodeProducts.get('5449000000996')).toBeNull();
    } finally {
      other.close();
    }
  });

  it('rolls the import back when a product row is invalid (all or nothing)', async () => {
    await h.repos.barcodeProducts.put(NUTELLA);
    const before = rows('barcode_product');
    await expect(h.repos.backup.replaceAll({ ...(await h.repos.backup.read()), barcodeProducts: [{ ...NUTELLA, per100g: {} as never, name: null as never }] })).rejects.toThrow();
    expect(rows('barcode_product')).toEqual(before);
  });
});

void sql;
