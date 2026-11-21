/// <reference types="node" />
import { strFromU8 } from 'fflate';

import type { BarcodeProductRecord } from '@/data';
import { createHarness, type Harness } from '@/data/testing/harness';
import { createDevice, lastShared, pickAndPrepare, type Device } from '../../testing/dataKit';
import { validDocument } from '../../testing/validDocument';
import { EXPORT_FORMAT_VERSION, ExportDocumentSchema, parseExportDocument } from '../exportFormat';

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
const INCOMPLETE: BarcodeProductRecord = { barcode: '96385074', name: '', brand: null, per100g: { protein: 3 }, servingG: null, missing: ['name', 'kcal', 'carbs', 'fat'], inconsistent: false, edited: false, fetchedAt: '2026-06-02T10:00:00.000Z' };
const UNUSED: BarcodeProductRecord = { ...NUTELLA, barcode: '4006381333931', name: 'Only cached' };

const documentWith = (barcode_products: unknown) => ({ ...validDocument(), barcode_products });
const exported = (barcode: Record<string, unknown> = {}) => ({
  barcode: '3017624010701', name: 'Nutella', brand: 'Ferrero', kcal_100g: 539, protein_100g: 6.3, carbs_100g: 57.5, fat_100g: 30.9, other_nutrients: { sugars: 56.3 },
  serving_g: 15, missing: [], inconsistent: false, edited: false, fetched_at: '2026-06-01T10:00:00.000Z', ...barcode,
});

describe('export format: barcode products', () => {
  it('keeps format_version 1: the new list is optional, so a file from before this change is still a valid file', () => {
    expect(EXPORT_FORMAT_VERSION).toBe(1);
    const before = validDocument();
    expect('barcode_products' in before).toBe(false);
    const parsed = parseExportDocument(before);
    expect(parsed.ok && parsed.document.barcode_products).toEqual([]);
  });

  it('accepts products and keeps every field', () => {
    const parsed = parseExportDocument(documentWith([exported(), exported({ barcode: '96385074', name: '', brand: null, kcal_100g: 0, other_nutrients: null, serving_g: null, missing: ['name', 'kcal'] })]));
    expect(parsed.ok && parsed.document.barcode_products).toHaveLength(2);
    expect(parsed.ok && parsed.document.barcode_products[0]).toMatchObject({ barcode: '3017624010701', kcal_100g: 539, other_nutrients: { sugars: 56.3 }, serving_g: 15 });
  });

  it.each([
    ['a barcode that is not 8 or 13 digits', { barcode: '12345' }],
    ['a barcode with letters', { barcode: '30176240107x1' }],
    ['more than 1,000 kcal per 100 g', { kcal_100g: 1001 }],
    ['more than 100 g of protein per 100 g', { protein_100g: 101 }],
    ['a negative value', { fat_100g: -1 }],
    ['an unknown nutrient', { other_nutrients: { zzz: 1 } }],
    ['a headline nutrient among the others', { other_nutrients: { kcal: 1 } }],
    ['a serving above the portion limit', { serving_g: 5001 }],
    ['a name that is far too long', { name: 'x'.repeat(501) }],
    ['a fetch time that is not a timestamp', { fetched_at: 'last week' }],
    ['a missing-field name nobody knows', { missing: ['salt'] }],
  ])('refuses %s, naming where', (_label, patch) => {
    const parsed = parseExportDocument(documentWith([exported(patch)]));
    expect(parsed).toMatchObject({ ok: false, code: 'invalid' });
    expect((parsed as { where: string }).where).toMatch(/^barcode_products\[0\]/);
  });

  it('refuses the same barcode twice', () => {
    expect(parseExportDocument(documentWith([exported(), exported()]))).toMatchObject({ ok: false, code: 'invalid', where: 'barcode_products[1].barcode' });
  });

  it('is part of the one schema', () => {
    expect(ExportDocumentSchema.safeParse(documentWith([exported()])).success).toBe(true);
  });
});

describe('export and import of barcode products (S3, S5)', () => {
  let a: Harness;
  let b: Harness;
  let from: Device;
  let to: Device;
  beforeEach(async () => {
    a = await createHarness();
    b = await createHarness();
    from = createDevice(a);
    to = createDevice(b);
  });
  afterEach(() => {
    from.services.close();
    to.services.close();
    a.close();
    b.close();
  });

  /** A saved item, a favorite, a recent and a cache entry nobody refers to. */
  async function seedProducts() {
    const { barcodeProducts, meals, foodUsage } = a.repos;
    for (const p of [NUTELLA, INCOMPLETE, UNUSED]) await barcodeProducts.put(p);
    await meals.save({
      eatenAt: new Date('2026-06-15T12:00:00.000Z'), timeZone: 'UTC', slot: 'snack', source: 'manual',
      items: [{ displayName: 'Nutella', grams: 30, foodSource: 'barcode', foodRef: NUTELLA.barcode, origin: 'manual', nutrients: { kcal: 161.7, protein: 1.89, carbs: 17.25, fat: 9.27, sugars: 16.89, sodium: 12.9 } }],
    });
    await foodUsage.setFavorite({ source: 'barcode', id: INCOMPLETE.barcode }, true);
  }

  const exportAndPick = async () => {
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const file = lastShared(from);
    return pickAndPrepare(to, file.name, file.bytes);
  };

  it('writes the products that a saved item, a favorite or a recent refers to, and not the rest of the cache', async () => {
    await seedProducts();
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const doc = JSON.parse(strFromU8(lastShared(from).bytes));
    expect(doc.barcode_products.map((p: { barcode: string }) => p.barcode).sort()).toEqual(['3017624010701', '96385074']);
    expect(JSON.stringify(doc)).not.toContain('4006381333931');
    expect(doc.format_version).toBe(1);
  });

  it('brings them back with the same totals: the saved item and the favorite are not dangling, and the incomplete one is still incomplete', async () => {
    await seedProducts();
    const prepared = await exportAndPick();
    await to.service.applyImport(prepared);

    expect(await b.repos.barcodeProducts.get(NUTELLA.barcode)).toEqual(NUTELLA);
    expect(await b.repos.barcodeProducts.get(INCOMPLETE.barcode)).toEqual(INCOMPLETE);
    expect(await b.repos.barcodeProducts.get(UNUSED.barcode)).toBeNull();
    expect(await b.repos.meals.getDay('2026-06-15')).toEqual(await a.repos.meals.getDay('2026-06-15'));
    expect((await b.repos.foodUsage.favorites()).map((f) => f.foodRef)).toEqual([INCOMPLETE.barcode]);
    // The restored product still recalculates a saved item when its grams change.
    const item = (await b.repos.meals.getDay('2026-06-15')).meals[0]!.items[0]!;
    expect(await b.repos.meals.updateItemGrams(item.id, 100)).toMatchObject({ kcal: 539, proteinG: 6.3 });
  });

  it('still imports a file made before this change (no barcode_products), and empties the cache it replaces', async () => {
    await b.repos.barcodeProducts.put(UNUSED);
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const doc = JSON.parse(strFromU8(lastShared(from).bytes));
    delete doc.barcode_products; // what an older app wrote
    const bytes = new TextEncoder().encode(JSON.stringify(doc));
    const prepared = await pickAndPrepare(to, 'qbit-nutrition-export-2026-11-01.json', bytes);
    await to.service.applyImport(prepared);
    expect(await b.repos.barcodeProducts.get(UNUSED.barcode)).toBeNull();
  });
});
