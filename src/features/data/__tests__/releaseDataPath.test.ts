/// <reference types="node" />
import { strToU8 } from 'fflate';

import { createHarness, type Harness } from '@/data/testing/harness';
import { createFakeHealthPlatform } from '@/platform/fakeHealthPlatform';
import { createHealthSync } from '../../health/healthSync';
import { dumpAll } from '../../testing/backupDump';
import { seedEverything } from '../../testing/backupSeed';
import { createDevice, documentText, fullState, jpeg, lastShared, pickAndPrepare, NOW, type Device } from '../../testing/dataKit';
import { validDocument } from '../../testing/validDocument';
import { createDataService } from '../dataService';
import { parseExportDocument } from '../exportFormat';

let a: Harness;
let b: Harness;
let from: Device;
let to: Device;
beforeEach(async () => {
  a = await createHarness();
  b = await createHarness();
  from = createDevice(a);
  to = createDevice(b);
  await seedEverything(a, { photoPath: 'photos/src-1.jpg' });
  from.platform.addPhoto('photos/src-1.jpg', jpeg(1));
});
afterEach(() => {
  jest.restoreAllMocks();
  from.services.close();
  to.services.close();
  a.close();
  b.close();
});

const exportIt = (device: Device = from, withPhotos = false) => device.service.exportData({ withPhotos, shareTitle: 'Export' });
const outcome = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error as { code: string; [key: string]: unknown });
const validDoc = (): any => JSON.parse(JSON.stringify(validDocument()));

describe('A1 — a stored date outside the range never stops the export without saying which meal', () => {
  it('names the meal (date and name) and does not write or share anything', async () => {
    const [{ id }] = a.client.prepare(`SELECT id FROM meal WHERE name = 'Oats'`).all() as { id: string }[];
    a.client.exec(`UPDATE meal SET local_date = '2031-03-04', eaten_at = '2031-03-04T10:00:00.000Z' WHERE id = '${id}'`);
    const before = await fullState(from);
    const error = await outcome(exportIt());
    expect(error).toMatchObject({ code: 'meal_out_of_range', meal: { id, date: '2031-03-04', name: 'Oats' } });
    expect(String((error as { where?: string }).where)).not.toMatch(/\[\d+\]/); // no array index
    expect(from.platform.state.shared).toHaveLength(0);
    expect(await fullState(from)).toEqual(before);
  });

  it('an audit timestamp from a wrong clock is brought to the export instant and reported; the file then imports', async () => {
    a.client.exec(`UPDATE meal SET created_at = '2031-01-01T00:00:00.000Z', updated_at = '2031-01-01T00:00:00.000Z'`);
    a.client.exec(`UPDATE food_usage SET last_used_at = '2031-01-01T00:00:00.000Z'`);
    const result = await exportIt();
    expect(result.clampedDates).toBeGreaterThan(0);
    const doc = JSON.parse(documentText(lastShared(from).bytes));
    expect(doc.food_usage.length).toBeGreaterThan(0); // favorites are not lost to a clock
    expect(doc.meals.every((m: { created_at: string }) => m.created_at <= NOW.toISOString())).toBe(true);
    await expect(pickAndPrepare(to, lastShared(from).name, lastShared(from).bytes)).resolves.toBeDefined();
  });

  it('the day limits of the export are the shared ones', () => {
    const doc = validDoc();
    doc.body_measurements[0].measured_on = '1999-12-31';
    expect(parseExportDocument(doc, () => new Date(NOW))).toMatchObject({ ok: false, where: 'body_measurements[0].measured_on' });
  });
});

describe('A1 — a phone whose clock is wrong says so when it refuses a valid file', () => {
  const fileFromAnotherPhone = () => strToU8(JSON.stringify(validDocument()));
  const serviceAt = (iso: string) => createDataService({ repos: b.repos, providers: to.services.providers, platform: to.platform, appVersion: '1.0.0', now: () => new Date(iso) });
  const pick = async (bytes: Uint8Array) => {
    to.platform.state.nextPick = { name: 'x.json', bytes };
    return (await to.platform.picker.pick())!;
  };

  it('names the phone date and the file date when the file was exported after the phone’s own date', async () => {
    const error = await outcome(serviceAt('2026-01-01T00:00:00.000Z').prepareImport(await pick(fileFromAnotherPhone())));
    expect(error).toMatchObject({ code: 'invalid', clock: { deviceDate: '2026-01-01', fileDate: '2026-11-21' } });
  });

  it('says it too when the phone date is before 2000', async () => {
    const error = await outcome(serviceAt('1970-01-01T00:00:00.000Z').prepareImport(await pick(fileFromAnotherPhone())));
    expect(error).toMatchObject({ code: 'invalid', clock: { deviceDate: '1970-01-01' } });
  });

  it('does not blame the clock for a file that is wrong in another way', async () => {
    const doc = validDoc();
    doc.meals[0].items[0].grams = 90000;
    const error = await outcome(pickAndPrepare(to, 'x.json', strToU8(JSON.stringify(doc))));
    expect(error).toMatchObject({ code: 'invalid' });
    expect((error as { clock?: unknown }).clock).toBeUndefined();
  });
});

describe('A2 — restoring a backup never lets the next weight sync remove what it restored', () => {
  it('Health Connect weights of the file arrive as the person’s own history; after a sync with an empty Health Connect nothing is gone', async () => {
    a.client.exec(`INSERT INTO body_measurement (id, measured_on, kind, value, source) VALUES ('hc-10', '2026-06-10', 'weight', 71, 'health_connect')`);
    await exportIt();
    const prepared = await pickAndPrepare(to, lastShared(from).name, lastShared(from).bytes);
    expect(prepared.preview.healthConnectWeights).toBe(2); // 2026-06-02 and 2026-06-10
    expect(prepared.preview.mergedWeights).toBe(1); // 2026-06-02 has the person's own entry too: that one is kept
    await to.service.applyImport(prepared);

    const imported = (await b.repos.measurements.list('weight')).map((m) => [m.measuredOn, m.value, m.source]);
    expect(imported).toEqual([
      ['2026-06-01', 70.4, 'manual'],
      ['2026-06-02', 70.1, 'manual'],
      ['2026-06-10', 71, 'manual'],
    ]);

    // This phone's Health Connect has nothing; the sync window covers 2026-06-02 and 2026-06-10.
    const platform = createFakeHealthPlatform();
    const health = createHealthSync({ repos: b.repos, platform, now: () => new Date('2026-06-15T12:00:00.000Z') });
    const before = dumpAll(b);
    await health.turnOn();
    await health.syncWeight();
    expect(dumpAll(b).body_measurement).toEqual(before.body_measurement);
    expect((await b.repos.measurements.list('weight')).map((m) => m.measuredOn)).toEqual(['2026-06-01', '2026-06-02', '2026-06-10']);
  });
});

describe('A3 — the export and the import limits agree by construction', () => {
  it('writes the document compactly', async () => {
    await exportIt();
    const text = documentText(lastShared(from).bytes);
    expect(text).not.toMatch(/\n/);
    expect(text).not.toMatch(/": /);
  });

  it('round trip at the limit: a document of exactly the limit exports and imports; one byte over is refused before anything is shared', async () => {
    await exportIt();
    const text = documentText(lastShared(from).bytes);
    const size = strToU8(text).byteLength;

    const at = createDevice(a, { limits: { maxDocumentBytes: size, maxFileBytes: size } });
    await at.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const file = lastShared(at);
    const target = createDevice(b, { limits: { maxDocumentBytes: size, maxFileBytes: size } });
    await expect(pickAndPrepare(target, file.name, file.bytes)).resolves.toBeDefined();
    target.services.close();

    const over = createDevice(a, { limits: { maxDocumentBytes: size - 1, maxFileBytes: size } });
    const error = await outcome(over.service.exportData({ withPhotos: false, shareTitle: 'Export' }));
    expect(error).toMatchObject({ code: 'too_large', limit: size - 1, size, kind: 'document' });
    expect(over.platform.state.shared).toHaveLength(0);
    expect(over.platform.state.cache.size).toBe(0);
    at.services.close();
    over.services.close();
  });

  it('photos that push the file over the total limit: refused with the advice to export without them, which then works', async () => {
    await exportIt();
    const withoutPhotos = strToU8(documentText(lastShared(from).bytes)).byteLength;
    const limited = createDevice(a, { limits: { maxTotalBytes: withoutPhotos + 5 } });
    limited.platform.addPhoto('photos/src-1.jpg', jpeg(1));
    const error = await outcome(limited.service.exportData({ withPhotos: true, shareTitle: 'Export' }));
    expect(error).toMatchObject({ code: 'too_large', kind: 'total', withoutPhotosFits: true });
    expect(limited.platform.state.shared).toHaveLength(0);
    await expect(limited.service.exportData({ withPhotos: false, shareTitle: 'Export' })).resolves.toBeDefined();
    limited.services.close();
  });

  it('a photo over the per-photo limit is left out and reported, as the importer would refuse it', async () => {
    const limited = createDevice(a, { limits: { maxPhotoBytes: 5 } });
    limited.platform.addPhoto('photos/src-1.jpg', jpeg(1));
    const result = await limited.service.exportData({ withPhotos: true, shareTitle: 'Export' });
    expect(result.photos).toBe(0);
    expect(result.skippedPhotos).toEqual(['photos/src-1.jpg']);
    limited.services.close();
  });
});

describe('A4 — "Delete all" states what was removed, and a leftover export file', () => {
  it('only listing orphan keys failed: the keys of the profiles are reported as removed', async () => {
    const [p1, p2] = (await a.repos.aiProviders.list()).map((p) => p.id);
    await from.services.secrets.set(p1!, 'key-one-123456');
    await from.services.secrets.set(p2!, 'key-two-123456');
    jest.spyOn(from.services.secrets, 'list').mockRejectedValue(new Error('keystore broke'));
    const error = await outcome(from.service.deleteAll({ confirmation: 'DELETE' }));
    expect(error).toMatchObject({ code: 'delete_incomplete', stage: 'keys', keysUnlistable: true, keysDeleted: 2 });
  });

  it('a cache that could not be cleared after a successful delete is reported, not hidden', async () => {
    from.platform.state.shareCompletesWhenDone = false;
    await exportIt(); // on Android the file stays in the cache until the next start
    const remove = from.platform.cache.remove.bind(from.platform.cache);
    jest.spyOn(from.platform.cache, 'remove').mockImplementation(async (uri) => {
      if (uri.includes('qbit-nutrition-export-')) throw new Error('locked');
      return remove(uri);
    });
    const result = await from.service.deleteAll({ confirmation: 'DELETE' });
    expect(result).toEqual({ exportFilesLeft: true });
    expect(await a.repos.profile.get()).toBeNull();
  });

  it('reports nothing left when the cache is clean', async () => {
    expect(await from.service.deleteAll({ confirmation: 'DELETE' })).toEqual({ exportFilesLeft: false });
  });
});

describe('A5 — the backup schema applies the rules of the file importer to imported tables', () => {
  const withTable = (patch: Record<string, unknown>, food: Record<string, unknown> = {}) => {
    const doc = validDoc();
    doc.imported_collections = [
      { id: 'c1', name: 'Table', file_name: 'table.csv', imported_at: '2026-06-01T00:00:00.000Z', preset_id: null, basis: 'g', foods: [{ id: 'f1', name: 'Lentils', group: null, per_100g: { kcal: 100 }, ...food }], ...patch },
    ];
    return parseExportDocument(doc, () => new Date(NOW));
  };

  it('accepts a plain table', () => expect(withTable({}).ok).toBe(true));
  it('refuses a blank or whitespace-only table name', () => {
    expect(withTable({ name: '   ' })).toMatchObject({ ok: false, where: 'imported_collections[0].name' });
  });
  it('refuses a path in file_name, either separator', () => {
    expect(withTable({ file_name: 'folder/table.csv' })).toMatchObject({ ok: false, where: 'imported_collections[0].file_name' });
    expect(withTable({ file_name: 'C:\\folder\\table.csv' })).toMatchObject({ ok: false, where: 'imported_collections[0].file_name' });
  });
  it('refuses a food whose name is only whitespace', () => {
    expect(withTable({}, { name: '  \t ' })).toMatchObject({ ok: false, where: 'imported_collections[0].foods[0].name' });
  });
});

describe('A7 — a barcode product completed by hand is in the file', () => {
  it('is exported even though nothing refers to it; cache-only products are not', async () => {
    await exportIt();
    const doc = JSON.parse(documentText(lastShared(from).bytes));
    const codes = doc.barcode_products.map((p: { barcode: string }) => p.barcode);
    expect(codes).toContain('12345670');
    expect(codes).not.toContain('4006381333931');
  });
});

describe('A8 — the preview shows what is on the phone now next to what the file brings', () => {
  it('counts every kind of data on both sides', async () => {
    await exportIt();
    await seedEverything(b);
    to.platform.addPhoto('photos/old-1.jpg', jpeg(9));
    const prepared = await pickAndPrepare(to, lastShared(from).name, lastShared(from).bytes);
    const { counts, current } = prepared.preview;
    expect(counts).toMatchObject({ importedTables: 1, importedFoods: 2, favoritesAndRecents: 3, barcodeProducts: 2 });
    expect(current).toMatchObject({ meals: 3, importedTables: 1, importedFoods: 2, favoritesAndRecents: 3, barcodeProducts: 3, photos: 1 });
  });
});

describe('A6 — the preview names the host of every imported provider', () => {
  it('lists each label with its host', async () => {
    await exportIt();
    const prepared = await pickAndPrepare(to, lastShared(from).name, lastShared(from).bytes);
    expect(prepared.preview.providerHosts).toEqual([
      { label: 'Local', host: '192.168.1.5:11434' },
      { label: 'Main', host: 'api.example.com' },
    ]);
  });
});

describe('A10 — a large import reports its steps and gives the screen a turn before the one synchronous write', () => {
  it('reports the photos one by one, then the write, then the clean-up', async () => {
    await exportIt(from, true);
    const prepared = await pickAndPrepare(to, lastShared(from).name, lastShared(from).bytes);
    const events: string[] = [];
    const replace = b.repos.backup.replaceAll.bind(b.repos.backup);
    jest.spyOn(b.repos.backup, 'replaceAll').mockImplementation(async (snapshot) => {
      events.push('db-write-started');
      return replace(snapshot);
    });
    const service = createDataService({
      repos: b.repos,
      providers: to.services.providers,
      platform: to.platform,
      appVersion: '1.0.0',
      now: () => new Date(NOW),
      yieldToUi: async () => {
        events.push('yield');
      },
    });
    await service.applyImport(prepared, { onProgress: (p) => events.push(p.step === 'photos' ? `photos ${p.done}/${p.total}` : p.step) });
    expect(events).toEqual(['photos 0/1', 'yield', 'photos 1/1', 'yield', 'writing', 'yield', 'db-write-started', 'cleaning', 'yield']);
  });
});
