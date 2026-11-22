/// <reference types="node" />
import { zipSync, strToU8, strFromU8, unzipSync } from 'fflate';

import { dumpAll, userTables } from '../../testing/backupDump';
import { DISTINCTIVE_KEY, seedEverything, type Seeded } from '../../testing/backupSeed';
import { createHarness, type Harness } from '@/data/testing/harness';
import { sql } from 'drizzle-orm';
import { ImportError, MAX_FILE_BYTES, type ImportErrorCode } from '../dataService';
import { ExportDocumentSchema } from '../exportFormat';
import { createDevice, documentText, fullState, everyByteOf, jpeg, lastShared, pickAndPrepare, NOW, type Device } from '../../testing/dataKit';

let a: Harness; // the phone the data comes from
let b: Harness; // the new installation
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

/** What the new installation has before importing: it went through onboarding, so it has its own accepted notice. */
async function onboardNewInstallation() {
  await b.repos.profile.save({ unitSystem: 'metric', locale: 'en', disclaimerAcceptedAt: '2026-11-20T09:00:00.000Z', disclaimerVersion: '2026-11-21' });
  await b.repos.settings.set('onboarding_completed_at', '2026-11-20T09:01:00.000Z');
  await b.repos.settings.set('catalog_asset_hash', 'new-install-hash');
}

async function seedSource(options: { photos?: boolean } = {}): Promise<Seeded> {
  const seeded = await seedEverything(a, { photoPath: 'photos/src-1.jpg' });
  if (options.photos !== false) from.platform.addPhoto('photos/src-1.jpg', jpeg(1));
  // A provider with a real key in secure storage, as the app would have after setup.
  const [first] = seeded.providerIds;
  await from.services.secrets.set(first!, DISTINCTIVE_KEY);
  return seeded;
}

const exportAndPick = async (withPhotos: boolean) => {
  await from.service.exportData({ withPhotos, shareTitle: 'Export' });
  const file = lastShared(from);
  return pickAndPrepare(to, file.name, file.bytes);
};

describe('export (S3, S4)', () => {
  it('hands the share sheet one JSON document in the documented format, named by the day', async () => {
    await seedSource({ photos: false });
    const result = await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const file = lastShared(from);
    expect(file.name).toBe('qbit-nutrition-export-2026-11-21.json');
    expect(file.mimeType).toBe('application/json');
    expect(result).toMatchObject({ fileName: file.name, photos: 0 });

    const doc = JSON.parse(strFromU8(file.bytes));
    expect(doc).toMatchObject({ format: 'qbit-nutrition-export', format_version: 1, app_version: '1.0.0', exported_at: NOW.toISOString() });
    expect(Object.keys(doc).sort()).toEqual(
      ['ai_providers', 'app_version', 'barcode_products', 'body_measurements', 'custom_foods', 'exported_at', 'food_usage', 'format', 'format_version', 'goals', 'imported_collections', 'match_memory', 'meals', 'profile', 'settings'].sort(),
    );
    expect(doc.meals).toHaveLength(3);
    expect(doc.meals[1].items[0].nutrients).toEqual({ sodium: 700 });
    expect(doc.body_measurements).toHaveLength(5);
  });

  it('leaves out scan rows, the barcode cache, and the settings that belong to this installation', async () => {
    await seedSource({ photos: false });
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const text = strFromU8(lastShared(from).bytes);
    expect(text).not.toContain('result_json');
    expect(text).not.toContain('{"items":[]}');
    const doc = JSON.parse(text);
    expect(Object.keys(doc.settings).sort()).toEqual(['keep_photos', 'locale', 'minimum_daily_kcal', 'scan_tip_count']);
    expect(doc.meals.every((m: { scan_id?: unknown }) => !('scan_id' in m))).toBe(true);
  });

  it('removes the temporary file as soon as the share sheet returns (the share-timing cases are in startupSweep.test.ts)', async () => {
    await seedSource({ photos: false });
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    expect([...from.platform.state.cache.keys()].filter((uri) => uri.includes('qbit-nutrition-export'))).toHaveLength(0);
  });

  it('removes the temporary file at once when the share sheet cannot open, and says it failed', async () => {
    await seedSource({ photos: false });
    from.platform.state.failShare = true;
    await expect(from.service.exportData({ withPhotos: false, shareTitle: 'Export' })).rejects.toThrow();
    expect(from.platform.state.cache.size).toBe(0);
  });

  it('reports a file that could not be written without sharing anything', async () => {
    await seedSource({ photos: false });
    from.platform.state.failCacheWrite = true;
    await expect(from.service.exportData({ withPhotos: false, shareTitle: 'Export' })).rejects.toThrow();
    expect(from.platform.state.shared).toHaveLength(0);
  });

  it('packs the kept photos with the document in a ZIP when asked', async () => {
    const seeded = await seedSource();
    const result = await from.service.exportData({ withPhotos: true, shareTitle: 'Export' });
    const file = lastShared(from);
    expect(file.name).toBe('qbit-nutrition-export-2026-11-21.zip');
    expect(file.mimeType).toBe('application/zip');
    expect(result.photos).toBe(1);
    const entries = unzipSync(file.bytes);
    expect(Object.keys(entries).sort()).toEqual(['photos/src-1.jpg', 'qbit-nutrition-export.json']);
    expect([...entries['photos/src-1.jpg']!]).toEqual([...jpeg(1)]);
    const doc = JSON.parse(strFromU8(entries['qbit-nutrition-export.json']!));
    expect(doc.meals.find((m: { id: string }) => m.id === seeded.photoMealId).photo_path).toBe('photos/src-1.jpg');
  });

  it('without photos the document names none, so an import never looks for one', async () => {
    await seedSource();
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const doc = JSON.parse(strFromU8(lastShared(from).bytes));
    expect(doc.meals.map((m: { photo_path: unknown }) => m.photo_path)).toEqual([null, null, null]);
  });

  it('a photo that is missing on disk is left out of the document, not an error', async () => {
    await seedSource({ photos: false });
    await from.service.exportData({ withPhotos: true, shareTitle: 'Export' });
    const file = lastShared(from);
    expect(file.name.endsWith('.json')).toBe(true); // no photo to pack: a plain document
    expect(JSON.parse(strFromU8(file.bytes)).meals.every((m: { photo_path: unknown }) => m.photo_path === null)).toBe(true);
  });

  it('S4: an API key never appears in the file, in any form, with or without photos', async () => {
    const seeded = await seedSource();
    // The key is really in secure storage: the test would be empty otherwise.
    expect(await from.services.secrets.get(seeded.providerIds[0]!)).toBe(DISTINCTIVE_KEY);
    expect((await from.services.providers.list()).find((p) => p.id === seeded.providerIds[0])?.hasKey).toBe(true);

    const forms = [DISTINCTIVE_KEY, encodeURIComponent(DISTINCTIVE_KEY), Buffer.from(DISTINCTIVE_KEY).toString('base64'), DISTINCTIVE_KEY.slice(3, 20)];
    for (const withPhotos of [false, true]) {
      await from.service.exportData({ withPhotos, shareTitle: 'Export' });
      for (const bytes of everyByteOf(lastShared(from).bytes)) {
        for (const form of forms) expect(bytes.includes(Buffer.from(form))).toBe(false);
      }
    }
  });

  it('S4: credentials in a stored base URL are cut; the query string is kept (a key pasted into it is refused, see exportLeaks.test.ts)', async () => {
    const seeded = await seedSource({ photos: false });
    a.client.exec(`UPDATE ai_provider SET base_url = 'https://user:pw@api.example.com/v1?x=1' WHERE id = '${seeded.providerIds[1]}'`);
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const doc = JSON.parse(strFromU8(lastShared(from).bytes));
    expect(doc.ai_providers.find((p: { label: string }) => p.label === 'Local').base_url).toBe('https://api.example.com/v1?x=1');
  });
});

describe('import round trip (S3)', () => {
  it('reproduces profile, goals, meals with items and snapshots, measurements, custom foods, usage, memory and settings; every day matches', async () => {
    const seeded = await seedSource({ photos: false });
    await onboardNewInstallation();
    const prepared = await exportAndPick(false);
    await to.service.applyImport(prepared);

    const source = await a.repos.backup.read();
    const copy = await b.repos.backup.read();

    // Profile: the person's own data is carried; the notice acceptance is the new installation's (see the next test).
    expect(copy.profile).toEqual({ ...source.profile, disclaimerAcceptedAt: '2026-11-20T09:00:00.000Z', disclaimerVersion: '2026-11-21' });
    expect(copy.goals).toEqual(source.goals);
    expect(copy.measurements).toEqual(source.measurements);
    expect(copy.customFoods).toEqual(source.customFoods);
    expect(copy.foodUsage).toEqual(source.foodUsage);
    expect(copy.matchMemory).toEqual(source.matchMemory);
    // Imported profiles get fresh ids (a key is stored under the id): everything else is the same.
    // Imported profiles are never active on arrival, whatever the file says (the person turns one on after looking at its address).
    const withoutId = (providers: typeof copy.aiProviders) => providers.map(({ id: _id, isActive: _active, ...rest }) => rest);
    expect(copy.aiProviders.every((p) => !p.isActive)).toBe(true);
    expect(withoutId(copy.aiProviders)).toEqual(withoutId(source.aiProviders));
    expect(copy.aiProviders.map((p) => p.id).filter((id) => source.aiProviders.some((q) => q.id === id))).toEqual([]);
    // The scan row is not exported, so the meal that came from it has no link; the photo was not exported either.
    expect(copy.meals).toEqual(source.meals.map((m) => ({ ...m, scanId: null, photoPath: null })));
    // Each imported profile carries a local mark until it is confirmed (not part of the file).
    expect(Object.keys(copy.settings).filter((key) => key.startsWith('ai_imported.'))).toHaveLength(copy.aiProviders.length);
    expect(Object.fromEntries(Object.entries(copy.settings).filter(([key]) => !key.startsWith('ai_imported.')))).toEqual({
      locale: 'es',
      keep_photos: 'true',
      minimum_daily_kcal: '1400',
      scan_tip_count: '2',
      onboarding_completed_at: '2026-11-20T09:01:00.000Z',
      catalog_asset_hash: 'new-install-hash',
    });

    // The same answers through the public reads, day by day.
    for (const day of ['2026-06-01', '2026-06-02', '2026-06-03']) {
      const original = await a.repos.meals.getDay(day);
      const restored = await b.repos.meals.getDay(day);
      expect(restored.totals).toEqual(original.totals);
      expect(restored.meals.map((m) => m.items.map((i) => [i.displayName, i.grams, i.kcal, i.nutrients]))).toEqual(original.meals.map((m) => m.items.map((i) => [i.displayName, i.grams, i.kcal, i.nutrients])));
      expect(await b.repos.goals.on(day)).toEqual(await a.repos.goals.on(day));
    }
    expect(await b.repos.meals.totalsByDay('2026-06-01', '2026-06-30')).toEqual(await a.repos.meals.totalsByDay('2026-06-01', '2026-06-30'));
    expect((await b.repos.customFoods.get(seeded.customFoodIds[0]!))?.otherNutrients).toEqual({ fiber: 10, sodium: 5 });
    expect((await b.repos.foodUsage.favorites()).map((u) => u.foodRef)).toEqual([seeded.customFoodIds[1]]);
  });

  it('with photos: every kept photo comes back with its own bytes, under a new name, and the old ones are gone', async () => {
    const seeded = await seedSource();
    await onboardNewInstallation();
    to.platform.addPhoto('photos/dest-old-1.jpg', jpeg(9));
    to.platform.addPhoto('photos/dest-orphan.jpg', jpeg(8)); // not referenced by any meal
    const prepared = await exportAndPick(true);
    expect(prepared.preview.counts.photos).toBe(1);
    await to.service.applyImport(prepared);

    const meal = (await b.repos.meals.getMeal(seeded.photoMealId))!;
    expect(meal.photoPath).toMatch(/^photos\//);
    expect([...to.platform.state.photos.get(meal.photoPath!)!]).toEqual([...jpeg(1)]);
    expect([...to.platform.state.photos.keys()]).toEqual([meal.photoPath]); // the previous installation's photos, referenced or not, are removed
  });

  it('imported provider profiles arrive without keys and old keys are gone (S4)', async () => {
    const seeded = await seedSource({ photos: false });
    await onboardNewInstallation();
    // The new installation already has a provider with a key, and one under an id the file also uses.
    const local = await b.repos.aiProviders.create({ label: 'Local one', preset: null, adapter: 'openai_compatible', baseUrl: 'https://x.example.com/v1', model: 'm', timeoutS: 30 });
    await to.services.secrets.set(local.id, 'local-secret-key');
    await to.services.secrets.set(seeded.providerIds[0]!, 'stale-key-under-an-imported-id');

    const prepared = await exportAndPick(false);
    const result = await to.service.applyImport(prepared);

    const providers = await to.services.providers.list();
    expect(providers.map((p) => p.hasKey)).toEqual([false, false]);
    expect(providers.map((p) => p.id)).not.toContain(seeded.providerIds[0]); // fresh ids: no stale key can match
    expect(await to.services.secrets.has(local.id)).toBe(false);
    // A key under an id no profile has is an orphan; the next start removes it.
    expect(await to.services.secrets.has(seeded.providerIds[0]!)).toBe(true);
    await to.service.sweepStartup();
    expect(await to.services.secrets.has(seeded.providerIds[0]!)).toBe(false);
    expect(result.providersNeedingKey).toBe(2);
    expect(result.leftovers).toEqual({ photos: false, keys: false });
  });

  it('keeps this installation’s accepted health notice and asks again for acknowledgements', async () => {
    const seeded = await seedSource({ photos: false });
    await onboardNewInstallation();
    await b.repos.settings.set(`ai_notice_ack.${seeded.providerIds[0]}`, '2026-11-20T10:00:00.000Z');
    const prepared = await exportAndPick(false);
    await to.service.applyImport(prepared);

    const profile = (await b.repos.profile.get())!;
    expect(profile.disclaimerAcceptedAt).toBe('2026-11-20T09:00:00.000Z'); // not the 2026-01-02 acceptance from the other phone
    expect(profile.disclaimerVersion).toBe('2026-11-21');
    expect(profile.locale).toBe('es'); // the language is the person's, so it is carried
    const settings = await b.repos.settings.getAll();
    expect(Object.keys(settings).filter((k) => k.startsWith('ai_notice_ack.'))).toEqual([]);
    expect(settings.onboarding_completed_at).toBe('2026-11-20T09:01:00.000Z');
  });

  it('without a profile on this installation the notice is marked as not accepted here', async () => {
    await seedSource({ photos: false });
    const prepared = await exportAndPick(false);
    await to.service.applyImport(prepared);
    const profile = (await b.repos.profile.get())!;
    expect(profile.disclaimerVersion).toBe('');
    expect(profile.disclaimerAcceptedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('shows what the file holds before anything is written', async () => {
    await seedSource();
    await from.service.exportData({ withPhotos: true, shareTitle: 'Export' });
    const file = lastShared(from);
    const before = dumpAll(b);
    const prepared = await pickAndPrepare(to, file.name, file.bytes);
    expect(prepared.preview).toEqual({
      formatVersion: 1,
      appVersion: '1.0.0',
      exportedAt: NOW.toISOString(),
      hasProfile: true,
      counts: { meals: 3, items: 4, weights: 3, measurements: 2, goals: 2, customFoods: 2, importedTables: 0, providers: 2, photos: 1 },
      dateRange: { from: '2026-06-01', to: '2026-06-03' },
      providersNeedingKey: 2,
    });
    expect(dumpAll(b)).toEqual(before); // looking is not importing
    expect(to.platform.state.cache.size).toBe(0); // and the copy the picker made is gone
  });

  it('replaces: what the installation had before does not survive', async () => {
    await seedSource({ photos: false });
    await onboardNewInstallation();
    await b.repos.measurements.record({ measuredOn: '2026-05-01', kind: 'weight', value: 99 });
    await b.repos.customFoods.create({ name: 'Old food', kcal100g: 1, protein100g: 1, carbs100g: 1, fat100g: 1 });
    const prepared = await exportAndPick(false);
    await to.service.applyImport(prepared);
    expect((await b.repos.measurements.list('weight')).map((m) => m.value)).not.toContain(99);
    expect((await b.repos.customFoods.list()).map((f) => f.name)).not.toContain('Old food');
  });
});

describe('files that cannot be imported leave everything as it was (S3)', () => {
  let destinationSeeded = false;
  beforeEach(() => {
    destinationSeeded = false;
  });

  async function expectRefused(bytes: Uint8Array, code: ImportErrorCode, extra: Record<string, unknown> = {}) {
    if (!destinationSeeded) {
      destinationSeeded = true;
      await seedEverything(b, { photoPath: 'photos/dest-1.jpg' });
      to.platform.addPhoto('photos/dest-1.jpg', jpeg(7));
      await to.services.secrets.set('some-provider', 'dest-key');
      for (const provider of await b.repos.aiProviders.list()) await to.services.secrets.set(provider.id, `key-of-${provider.label}-0123456789`);
    }
    const stateBefore = await fullState(to);

    const error = await pickAndPrepare(to, 'file.json', bytes).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ImportError);
    expect(error).toMatchObject({ code, ...extra });

    expect(await fullState(to)).toEqual(stateBefore); // every row, every photo and every stored key, byte for byte
    expect(to.platform.state.cache.size).toBe(0); // the picked copy is not left behind
  }

  const goodDocument = async () => {
    await seedSource({ photos: false });
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    return strFromU8(lastShared(from).bytes);
  };

  it('a file that is not an export at all', async () => {
    await expectRefused(strToU8('hello, this is a text file'), 'not_export');
    await expectRefused(strToU8('{"some":"other json"}'), 'not_export');
    await expectRefused(strToU8(''), 'not_export');
    await expectRefused(Uint8Array.from([0, 1, 2, 3, 250, 251]), 'not_export');
  });

  it('a truncated file', async () => {
    const text = await goodDocument();
    await expectRefused(strToU8(text.slice(0, Math.floor(text.length / 2))), 'damaged');
    await expectRefused(strToU8(text.slice(0, text.length - 3)), 'damaged');
  });

  it('a wrong type inside a meal, with the place named', async () => {
    const doc = JSON.parse(await goodDocument());
    doc.meals[1].items[0].grams = 'three hundred';
    await expectRefused(strToU8(JSON.stringify(doc)), 'invalid', { where: 'meals[1].items[0].grams' });
  });

  it('a value the database would refuse', async () => {
    const doc = JSON.parse(await goodDocument());
    doc.goals[0].end_date = null; // two open goal periods
    await expectRefused(strToU8(JSON.stringify(doc)), 'invalid', { where: 'goals[1].end_date' });
  });

  it('a newer format version, with both versions named', async () => {
    const doc = JSON.parse(await goodDocument());
    doc.format_version = 2;
    doc.new_in_v2 = { anything: true };
    await expectRefused(strToU8(JSON.stringify(doc)), 'newer_version', { fileVersion: 2, supportedVersion: 1 });
  });

  it('a file that is too large, before it is read', async () => {
    await seedEverything(b);
    const dbBefore = dumpAll(b);
    to.platform.state.nextPick = { name: 'huge.zip', bytes: Uint8Array.from([1]) };
    const picked = (await to.platform.picker.pick())!;
    await expect(to.service.prepareImport({ ...picked, size: MAX_FILE_BYTES + 1 })).rejects.toMatchObject({ code: 'too_large' });
    expect(dumpAll(b)).toEqual(dbBefore);
    expect(to.platform.state.cache.size).toBe(0);
  });

  it('a damaged ZIP', async () => {
    await seedSource();
    await from.service.exportData({ withPhotos: true, shareTitle: 'Export' });
    const zip = lastShared(from).bytes;
    await expectRefused(zip.slice(0, Math.floor(zip.length / 2)), 'damaged');
  });

  it('a ZIP without the document', async () => {
    await expectRefused(zipSync({ 'readme.txt': strToU8('nothing here') }), 'not_export');
  });

  it('a ZIP whose document names a photo that is not in it', async () => {
    const doc = JSON.parse(await goodDocument());
    doc.meals[1].photo_path = 'photos/missing.jpg';
    await expectRefused(zipSync({ 'qbit-nutrition-export.json': strToU8(JSON.stringify(doc)) }), 'photos_missing');
  });

  it('a ZIP whose photo is not a JPEG', async () => {
    const doc = JSON.parse(await goodDocument());
    doc.meals[1].photo_path = 'photos/fake.jpg';
    await expectRefused(
      zipSync({ 'qbit-nutrition-export.json': strToU8(JSON.stringify(doc)), 'photos/fake.jpg': strToU8('#!/bin/sh\nrm -rf /') }),
      'photo_invalid',
    );
  });

  it('a ZIP with a path that climbs out of the photos folder is never read as a photo', async () => {
    const doc = JSON.parse(await goodDocument());
    doc.meals[1].photo_path = 'photos/../../x.jpg';
    await expectRefused(zipSync({ 'qbit-nutrition-export.json': strToU8(JSON.stringify(doc)), '../x.jpg': jpeg(1) }), 'invalid', { where: 'meals[1].photo_path' });
  });
});

describe('the replacement is all or nothing (S3)', () => {
  async function prepareFromSource(withPhotos: boolean) {
    await seedSource();
    return exportAndPick(withPhotos);
  }

  async function seedDestination() {
    await seedEverything(b, { photoPath: 'photos/dest-1.jpg' });
    to.platform.addPhoto('photos/dest-1.jpg', jpeg(7));
    to.platform.addPhoto('photos/dest-orphan.jpg', jpeg(6));
    await to.services.secrets.set('dest-provider', 'dest-key');
    for (const provider of await b.repos.aiProviders.list()) await to.services.secrets.set(provider.id, `key-of-${provider.label}-0123456789`);
  }

  it('a failure injected midway through the write rolls everything back, and removes neither old photos nor keys, nor leaves new ones', async () => {
    const prepared = await prepareFromSource(true);
    await seedDestination();
    const stateBefore = await fullState(to);

    b.client.exec(`CREATE TRIGGER boom BEFORE INSERT ON custom_food BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    await expect(to.service.applyImport(prepared)).rejects.toMatchObject({ code: 'write_failed' });
    b.client.exec('DROP TRIGGER boom');

    // Every row, every photo (the staged copies are removed again, the old ones untouched) and every stored key.
    expect(await fullState(to)).toEqual(stateBefore);
  });

  it('a failure while storing the second photo leaves no stray file and the old data as it was', async () => {
    await seedEverything(a, { photoPath: 'photos/src-1.jpg' });
    from.platform.addPhoto('photos/src-1.jpg', jpeg(1));
    // A second meal with a photo.
    const extra = await a.repos.meals.save({
      eatenAt: new Date('2026-06-04T10:00:00.000Z'),
      timeZone: 'UTC',
      slot: 'snack',
      source: 'scan',
      photoPath: 'photos/src-2.jpg',
      items: [{ displayName: 'Apple', grams: 100, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 } }],
    });
    expect(extra.photoPath).toBe('photos/src-2.jpg');
    from.platform.addPhoto('photos/src-2.jpg', jpeg(2));
    const prepared = await exportAndPick(true);
    expect(prepared.preview.counts.photos).toBe(2);

    await seedDestination();
    const stateBefore = await fullState(to);
    to.platform.state.failPhotoWriteAt = 2;
    await expect(to.service.applyImport(prepared)).rejects.toMatchObject({ code: 'write_failed' });

    expect(await fullState(to)).toEqual(stateBefore);
  });

  it('after a failed import the same file can be imported again', async () => {
    const prepared = await prepareFromSource(false);
    await seedDestination();
    b.client.exec(`CREATE TRIGGER boom BEFORE INSERT ON setting BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    await expect(to.service.applyImport(prepared)).rejects.toMatchObject({ code: 'write_failed' });
    b.client.exec('DROP TRIGGER boom');
    await expect(to.service.applyImport(prepared)).resolves.toMatchObject({ meals: 3 });
    expect((await b.repos.meals.totalsByDay('2026-06-01', '2026-06-30')).length).toBe(3);
  });

  it('old photos that cannot be deleted afterwards do not undo a successful import; they are reported', async () => {
    const prepared = await prepareFromSource(false);
    await seedDestination();
    to.platform.state.failPhotoRemove.add('photos/dest-orphan.jpg');
    const result = await to.service.applyImport(prepared);
    expect(result.leftovers.photos).toBe(true);
    expect((await b.repos.meals.totalsByDay('2026-06-01', '2026-06-30')).length).toBe(3);
  });

  it('old keys that cannot be removed afterwards are reported too', async () => {
    const prepared = await prepareFromSource(false);
    await seedDestination();
    jest.spyOn(to.services.secrets, 'remove').mockRejectedValue(new Error('keystore'));
    const result = await to.service.applyImport(prepared);
    expect(result.leftovers.keys).toBe(true);
  });
});

describe('delete all data (S3)', () => {
  it('leaves zero rows in every table, no photo, no key and no stored acknowledgement', async () => {
    const seeded = await seedSource();
    from.platform.addPhoto('photos/orphan.jpg', jpeg(5)); // on disk but referenced by no meal
    await from.services.secrets.set(seeded.providerIds[1]!, `${DISTINCTIVE_KEY}-2`);

    await from.service.deleteAll({ confirmation: 'DELETE' });

    for (const table of userTables(a)) {
      expect({ table, rows: a.db.all<{ n: number }>(sql.raw(`SELECT count(*) AS n FROM "${table}"`))[0]!.n }).toEqual({ table, rows: 0 });
    }
    expect(from.platform.state.photos.size).toBe(0);
    for (const id of seeded.providerIds) expect(await from.services.secrets.has(id)).toBe(false);
    expect(await a.repos.settings.getAll()).toEqual({});
    expect(await a.repos.profile.get()).toBeNull();
  });

  it('is all or nothing for the data: when a key cannot be removed, nothing else is deleted yet', async () => {
    await seedSource();
    const before = dumpAll(a);
    const photos = [...from.platform.state.photos.keys()];
    jest.spyOn(from.services.secrets, 'remove').mockRejectedValue(new Error('keystore'));
    await expect(from.service.deleteAll({ confirmation: 'DELETE' })).rejects.toThrow();
    expect(dumpAll(a)).toEqual(before);
    expect([...from.platform.state.photos.keys()]).toEqual(photos);
  });

  it('can be run again after a failure and then finishes the job', async () => {
    const seeded = await seedSource();
    from.platform.state.failPhotoRemove.add('photos/src-1.jpg');
    await expect(from.service.deleteAll({ confirmation: 'DELETE' })).rejects.toThrow();
    expect((await a.repos.meals.totalsByDay('2026-06-01', '2026-06-30')).length).toBe(3); // the data is still there
    from.platform.state.failPhotoRemove.clear();
    await from.service.deleteAll({ confirmation: 'DELETE' });
    expect(from.platform.state.photos.size).toBe(0);
    expect(await a.repos.profile.get()).toBeNull();
    expect(await from.services.secrets.has(seeded.providerIds[0]!)).toBe(false);
  });

  it('also removes a file that an export left in the cache', async () => {
    await seedSource({ photos: false });
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    await from.service.deleteAll({ confirmation: 'DELETE' });
    expect([...from.platform.state.cache.keys()].filter((uri) => uri.includes('qbit-nutrition-export'))).toEqual([]);
  });
});

describe('the format on disk', () => {
  it('the exported document is exactly what the schema parses back (one definition)', async () => {
    await seedSource({ photos: false });
    await from.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const text = documentText(lastShared(from).bytes);
    const parsed = ExportDocumentSchema.parse(JSON.parse(text));
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(JSON.parse(text));
  });
});
