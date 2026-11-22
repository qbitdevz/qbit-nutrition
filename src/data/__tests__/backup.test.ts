/** @jest-environment node */
import { sql } from 'drizzle-orm';
import { createHarness, type Harness } from '../testing/harness';
import { dumpAll, userTables } from '@/features/testing/backupDump';
import { seedEverything } from '@/features/testing/backupSeed';

let h: Harness;
let other: Harness;
beforeEach(async () => {
  h = await createHarness();
  other = await createHarness();
});
afterEach(() => {
  h.close();
  other.close();
});

const count = (harness: Harness, table: string) => harness.db.all<{ n: number }>(sql.raw(`SELECT count(*) AS n FROM "${table}"`))[0]!.n;

describe('BackupRepository.read', () => {
  it('reads everything the user created, with the items and nutrient snapshots of each meal', async () => {
    const seeded = await seedEverything(h);
    const snapshot = await h.repos.backup.read();

    expect(snapshot.profile).toMatchObject({ unitSystem: 'imperial', locale: 'es', heightCm: 168.5 });
    expect(snapshot.goals.map((g) => [g.startDate, g.endDate, g.kcalTarget])).toEqual([
      ['2026-01-01', '2026-06-01', 2000],
      ['2026-06-02', null, 1800],
    ]);
    expect(snapshot.measurements).toHaveLength(5);
    expect(snapshot.customFoods.map((f) => f.name).sort()).toEqual(['Grandma soup', 'House oats']);
    expect(snapshot.meals).toHaveLength(3);
    const photoMeal = snapshot.meals.find((m) => m.id === seeded.photoMealId)!;
    expect(photoMeal.items.map((i) => i.displayName)).toEqual(['Grandma soup', 'Bread, estimated']);
    expect(photoMeal.items[0]!.nutrients).toEqual({ sodium: 700 });
    expect(snapshot.foodUsage.length).toBeGreaterThan(0);
    expect(snapshot.matchMemory).toEqual([{ name: 'soup', ref: { source: 'custom', id: seeded.customFoodIds[1] }, timesConfirmed: 2, updatedAt: expect.any(String) }]);
    expect(snapshot.aiProviders.map((p) => p.label).sort()).toEqual(['Local', 'Main']);
    expect(snapshot.settings.locale).toBe('es');
  });

  it('has no API key field anywhere in what it reads', async () => {
    await seedEverything(h);
    const provider = (await h.repos.backup.read()).aiProviders[0]!;
    expect(Object.keys(provider).sort()).toEqual(['adapter', 'baseUrl', 'id', 'isActive', 'label', 'lastTestAt', 'lastTestResult', 'model', 'outputMode', 'preset', 'timeoutS']);
  });
});

describe('BackupRepository.replaceAll', () => {
  it('copies one database into another so that every public read matches, day totals included', async () => {
    await seedEverything(h);
    const snapshot = await h.repos.backup.read();
    await other.repos.backup.replaceAll(snapshot);

    const copy = await other.repos.backup.read();
    // Scan rows are not part of a snapshot, so the link from the scanned meal goes with them.
    expect(copy).toEqual({ ...snapshot, meals: snapshot.meals.map((m) => ({ ...m, scanId: null })) });
    expect(await other.repos.meals.totalsByDay('2026-06-01', '2026-06-30')).toEqual(await h.repos.meals.totalsByDay('2026-06-01', '2026-06-30'));
    expect(await other.repos.goals.on('2026-06-15')).toEqual(await h.repos.goals.on('2026-06-15'));
  });

  it('replaces what was there: nothing of the old data survives, scans and the barcode cache included', async () => {
    await seedEverything(other);
    other.client.exec(`INSERT INTO barcode_product (barcode, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fetched_at) VALUES ('1', 'Cached', 1, 1, 1, 1, '2026-01-01T00:00:00.000Z')`);
    await seedEverything(h);
    const snapshot = await h.repos.backup.read();
    await other.repos.backup.replaceAll({ ...snapshot, meals: snapshot.meals.slice(0, 1), settings: { keep_photos: 'false' } });

    const after = await other.repos.backup.read();
    expect(after.meals).toHaveLength(1);
    expect(after.settings).toEqual({ keep_photos: 'false' });
    expect(count(other, 'scan')).toBe(0);
    expect(count(other, 'barcode_product')).toBe(snapshot.barcodeProducts.length); // only the products of the file; the old cache is gone
    expect(count(other, 'barcode_product')).not.toBe(0);
  });

  it('is all or nothing: a failure midway rolls back and leaves the old data byte for byte', async () => {
    await seedEverything(h);
    const snapshot = await h.repos.backup.read();
    await seedEverything(other);
    const before = dumpAll(other);

    // The settings are written last: fail there, after everything else was already written.
    other.client.exec(`CREATE TRIGGER boom BEFORE INSERT ON setting BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    await expect(other.repos.backup.replaceAll(snapshot)).rejects.toMatchObject({ cause: { message: expect.stringContaining('injected failure') } });
    other.client.exec('DROP TRIGGER boom');

    expect(dumpAll(other)).toEqual(before);
  });

  it('rolls back too when a row breaks a constraint (two open goals)', async () => {
    await seedEverything(h);
    const snapshot = await h.repos.backup.read();
    await seedEverything(other);
    const before = dumpAll(other);
    await expect(other.repos.backup.replaceAll({ ...snapshot, goals: snapshot.goals.map((g) => ({ ...g, endDate: null })) })).rejects.toThrow();
    expect(dumpAll(other)).toEqual(before);
  });

  it('an empty snapshot replaces everything with nothing', async () => {
    await seedEverything(h);
    await h.repos.backup.replaceAll({ profile: null, goals: [], measurements: [], meals: [], customFoods: [], importedCollections: [], barcodeProducts: [], foodUsage: [], matchMemory: [], aiProviders: [], settings: {} });
    expect((await h.repos.backup.read()).meals).toEqual([]);
    expect(count(h, 'meal_item_nutrient')).toBe(0);
  });
});

describe('BackupRepository.deleteAll', () => {
  it('leaves zero rows in every table', async () => {
    await seedEverything(h);
    h.client.exec(`INSERT INTO barcode_product (barcode, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fetched_at) VALUES ('1', 'Cached', 1, 1, 1, 1, '2026-01-01T00:00:00.000Z')`);
    await h.repos.backup.deleteAll();
    expect(userTables(h).map((table) => ({ table, rows: count(h, table) }))).toEqual(userTables(h).map((table) => ({ table, rows: 0 })));
  });

  it('keeps the migration bookkeeping, so the next start does not migrate again', async () => {
    await h.repos.backup.deleteAll();
    expect(count(h, '__drizzle_migrations')).toBeGreaterThan(0);
  });

  it('is all or nothing too', async () => {
    await seedEverything(h);
    const before = dumpAll(h);
    h.client.exec(`CREATE TRIGGER boom BEFORE DELETE ON setting BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    await expect(h.repos.backup.deleteAll()).rejects.toMatchObject({ cause: { message: expect.stringContaining('injected failure') } });
    h.client.exec('DROP TRIGGER boom');
    expect(dumpAll(h)).toEqual(before);
  });
});

describe('the shared seed covers every table, so the all-or-nothing tests cover every row (A9)', () => {
  it('fills every user table, imported collections, their foods and search entries, and barcode products included', async () => {
    await seedEverything(h);
    const empty = userTables(h).filter((table) => count(h, table) === 0);
    expect(empty).toEqual([]);
  });

  it('a failure at the last write rolls back the imported tables and barcode products too', async () => {
    await seedEverything(h);
    const snapshot = await h.repos.backup.read();
    expect(snapshot.importedCollections.length).toBeGreaterThan(0);
    expect(snapshot.barcodeProducts.length).toBeGreaterThan(0);
    await seedEverything(other);
    other.client.exec(`DELETE FROM food_collection`);
    other.client.exec(`DELETE FROM barcode_product`);
    const before = dumpAll(other);
    other.client.exec(`CREATE TRIGGER boom BEFORE INSERT ON setting BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    await expect(other.repos.backup.replaceAll(snapshot)).rejects.toThrow();
    other.client.exec('DROP TRIGGER boom');
    expect(dumpAll(other)).toEqual(before); // no collection, food, token or product of the file was left behind
    expect(count(other, 'imported_food_token')).toBe(0);
  });
});

describe('a barcode product the person completed by hand is part of the backup (A7)', () => {
  it('is read even when nothing refers to it; a product that is only cache is not', async () => {
    await seedEverything(h);
    const barcodes = (await h.repos.backup.read()).barcodeProducts.map((p) => [p.barcode, p.edited]);
    expect(barcodes).toEqual(expect.arrayContaining([['12345670', true], ['5449000000996', false]]));
    expect(barcodes.map(([code]) => code)).not.toContain('4006381333931');
  });
});

describe('coverage of the data model', () => {
  it('lists the tables, so a new one fails here until the backup covers it', () => {
    expect(userTables(h)).toEqual([
      'ai_provider',
      'barcode_product',
      'body_measurement',
      'custom_food',
      'food_collection',
      'food_usage',
      'goal',
      'imported_food',
      'imported_food_token',
      'match_memory',
      'meal',
      'meal_item',
      'meal_item_nutrient',
      'profile',
      'scan',
      'setting',
    ]);
  });
});
