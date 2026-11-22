/// <reference types="node" />
import { strFromU8 } from 'fflate';

import { createHarness, type Harness } from '@/data/testing/harness';
import { createDevice, lastShared, pickAndPrepare, type Device } from '../../testing/dataKit';
import { validDocument } from '../../testing/validDocument';
import { EXPORT_FORMAT_VERSION, parseExportDocument } from '../exportFormat';

/**
 * DECISION (S1, S2, RN-16): the tables a person imports are THEIR data, so a personal export carries them and a restore brings them back.
 * The consequence, stated on the screen and in the guide: an export made after an import CONTAINS that table, so the file is a
 * personal backup, not something to share. These tests pin both halves.
 */
const collection = (over: Record<string, unknown> = {}, foods: unknown[] = [food()]) => ({
  id: 'col-1', name: 'Mi tabla', file_name: 'tabla.csv', imported_at: '2026-06-01T10:00:00.000Z', preset_id: null, basis: 'g', foods, ...over,
});
const food = (over: Record<string, unknown> = {}) => ({ id: 'f-1', name: 'Manzana inventada', group: 'Frutas', per_100g: { kcal: 52.5, protein: 0.3 }, ...over });
const documentWith = (imported_collections: unknown) => ({ ...validDocument(), imported_collections });

describe('export format: imported tables', () => {
  it('keeps format_version 1: the list is optional, so a file from before is still valid', () => {
    expect(EXPORT_FORMAT_VERSION).toBe(1);
    const parsed = parseExportDocument(validDocument());
    expect(parsed.ok && parsed.document.imported_collections).toEqual([]);
  });

  it('accepts a collection and keeps every field, unknown nutrients absent', () => {
    const parsed = parseExportDocument(documentWith([collection({ basis: 'ml', preset_id: 'x' })]));
    expect(parsed.ok && parsed.document.imported_collections[0]).toMatchObject({ name: 'Mi tabla', basis: 'ml', preset_id: 'x', foods: [{ name: 'Manzana inventada', per_100g: { kcal: 52.5, protein: 0.3 } }] });
  });

  it.each([
    ['a nutrient this app does not track', collection({}, [food({ per_100g: { zzz: 1 } })])],
    ['a negative value', collection({}, [food({ per_100g: { kcal: -1 } })])],
    ['a value above what 100 g can hold', collection({}, [food({ per_100g: { kcal: 1001 } })])],
    ['a food with no value at all', collection({}, [food({ per_100g: {} })])],
    ['a table with no foods', collection({}, [])],
    ['a blank table name', collection({ name: '' })],
    ['a basis that is not g or ml', collection({ basis: 'kg' })],
    ['the same food id twice', collection({}, [food(), food()])],
  ])('refuses %s, naming where', (_label, bad) => {
    const parsed = parseExportDocument(documentWith([bad]));
    expect(parsed).toMatchObject({ ok: false, code: 'invalid' });
    expect((parsed as { where: string }).where).toMatch(/^imported_collections\[0\]/);
  });

  it('refuses the same table id twice', () => {
    expect(parseExportDocument(documentWith([collection(), collection({}, [food({ id: 'f-2' })])]))).toMatchObject({ ok: false, where: 'imported_collections[1].id' });
  });
});

describe('export and import of imported tables', () => {
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

  async function seed() {
    const created = await a.repos.importedFoods.importCollection({ name: 'Mi tabla', fileName: 'tabla.csv', presetId: null, basis: 'ml' }, [
      { name: 'Manzana inventada', group: 'Frutas', per100g: { kcal: 52.499999999999993, protein: 0, sodium: 1 } },
      { name: 'Pan de ejemplo', per100g: { kcal: 265, carbs: 49 } },
    ]);
    const [apple] = await a.repos.importedFoods.search('manzana', 1);
    await a.repos.meals.save({
      eatenAt: new Date('2026-06-15T12:00:00.000Z'), timeZone: 'UTC', slot: 'snack', source: 'manual',
      items: [{ displayName: apple!.name, grams: 200, foodSource: 'custom', foodRef: apple!.id, origin: 'manual', nutrients: { kcal: 105, protein: 0, sodium: 2 } }],
    });
    await a.repos.foodUsage.setFavorite({ source: 'custom', id: apple!.id }, true);
    return { created, apple: apple! };
  }

  it('writes the table with all its foods, so the file contains it', async () => {
    await seed();
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const text = strFromU8(lastShared(from).bytes);
    const doc = JSON.parse(text);
    expect(doc.format_version).toBe(1);
    expect(doc.imported_collections).toHaveLength(1);
    expect(doc.imported_collections[0]).toMatchObject({ name: 'Mi tabla', file_name: 'tabla.csv', basis: 'ml' });
    expect(doc.imported_collections[0].foods.map((f: { name: string }) => f.name)).toEqual(['Manzana inventada', 'Pan de ejemplo']);
    expect(text).toContain('Pan de ejemplo');
  });

  it('round trip: tables, foods, values, favorites and the logged meal come back identical and still searchable', async () => {
    const { created, apple } = await seed();
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const file = lastShared(from);
    const prepared = await pickAndPrepare(to, file.name, file.bytes);
    expect(prepared.preview.counts.importedTables).toBe(1);
    await to.service.applyImport(prepared);

    expect(await b.repos.importedFoods.listCollections()).toEqual([created]);
    expect((await b.repos.importedFoods.search('manzana', 1))[0]).toEqual(apple);
    expect((await b.repos.importedFoods.search('pan', 1))[0]!.per100g).toEqual({ kcal: 265, carbs: 49 });
    expect((await b.repos.foodUsage.favorites()).map((f) => f.foodRef)).toEqual([apple.id]);
    expect(await b.repos.meals.getDay('2026-06-15')).toEqual(await a.repos.meals.getDay('2026-06-15'));
    // The restored food still recalculates a logged item from its own values.
    const item = (await b.repos.meals.getDay('2026-06-15')).meals[0]!.items[0]!;
    expect((await b.repos.meals.updateItemGrams(item.id, 100)).kcal).toBe(52.499999999999993);
  });

  it('replaces the tables on the phone that imports (the import replaces everything, as before)', async () => {
    await b.repos.importedFoods.importCollection({ name: 'Otra' }, [{ name: 'Zanahoria', per100g: { kcal: 41 } }]);
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const file = lastShared(from);
    await to.service.applyImport(await pickAndPrepare(to, file.name, file.bytes));
    expect((await b.repos.importedFoods.listCollections()).map((c) => c.name)).toEqual([]);
  });
});
