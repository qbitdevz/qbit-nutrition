/// <reference types="node" />
import { strFromU8 } from 'fflate';

import { createHarness, type Harness } from '@/data/testing/harness';
import { DISTINCTIVE_KEY, seedEverything, type Seeded } from '../../testing/backupSeed';
import { createDevice, everyByteOf, fullState, jpeg, lastShared, type Device } from '../../testing/dataKit';

let a: Harness;
let device: Device;
let seeded: Seeded;
beforeEach(async () => {
  a = await createHarness();
  device = createDevice(a);
  seeded = await seedEverything(a, { photoPath: 'photos/src-1.jpg' });
  device.platform.addPhoto('photos/src-1.jpg', jpeg(1));
  await device.services.secrets.set(seeded.providerIds[0]!, DISTINCTIVE_KEY);
});
afterEach(() => {
  device.services.close();
  a.close();
});

const exportIt = (withPhotos = false) => device.service.exportData({ withPhotos, shareTitle: 'Export' });

/** The export is refused, names the field, and nothing was shared, written or changed. */
async function expectRefusedAt(where: string, code = 'secret_in_field') {
  const before = await fullState(device);
  await expect(exportIt()).rejects.toMatchObject({ code, where });
  expect(device.platform.state.shared).toHaveLength(0);
  expect([...device.platform.state.cache.keys()]).toEqual([]);
  expect(await fullState(device)).toEqual(before);
}

describe('S4: a key that was pasted into the user’s own data never reaches the file', () => {
  it.each([
    ['the label', (p: string) => `UPDATE ai_provider SET label = 'My ${p} key' WHERE label = 'Main'`, 'ai_providers[1].label'],
    ['the model', (p: string) => `UPDATE ai_provider SET model = '${p}' WHERE label = 'Main'`, 'ai_providers[1].model'],
    ['the path of the base URL', (p: string) => `UPDATE ai_provider SET base_url = 'https://api.example.com/${p}/v1' WHERE label = 'Main'`, 'ai_providers[1].base_url'],
    ['a meal note', (p: string) => `UPDATE meal SET note = 'remember ${p}' WHERE name = 'Oats'`, 'meals[0].note'],
    ['a custom food name', (p: string) => `UPDATE custom_food SET name = 'Soup ${p}' WHERE name = 'Grandma soup'`, 'custom_foods[1].name'],
  ])('is refused when it is in %s, in the form it was typed', async (_name, sql, where) => {
    a.client.exec(sql(DISTINCTIVE_KEY));
    await expectRefusedAt(where);
  });

  it('is refused when only the URL-encoded form is in the file', async () => {
    a.client.exec(`UPDATE ai_provider SET base_url = 'https://api.example.com/${encodeURIComponent(DISTINCTIVE_KEY)}/v1' WHERE label = 'Main'`);
    await expectRefusedAt('ai_providers[1].base_url');
  });

  it('is refused in a query string too, naming the field', async () => {
    a.client.exec(`UPDATE ai_provider SET base_url = 'https://api.example.com/v1?key=${encodeURIComponent(DISTINCTIVE_KEY)}' WHERE label = 'Main'`);
    await expectRefusedAt('ai_providers[1].base_url');
  });

  it('checks the keys of every profile, not only the active one', async () => {
    await device.services.secrets.set(seeded.providerIds[1]!, 'second-profile-key-ABCDEFGH');
    a.client.exec(`UPDATE meal SET note = 'second-profile-key-ABCDEFGH' WHERE name = 'Oats'`);
    await expectRefusedAt('meals[0].note');
  });

  it('refuses rather than guess when the keys cannot be read', async () => {
    jest.spyOn(device.services.secrets, 'get').mockRejectedValue(new Error('keystore'));
    await expect(exportIt()).rejects.toMatchObject({ code: 'keys_unreadable' });
    expect(device.platform.state.shared).toHaveLength(0);
    expect(device.platform.state.cache.size).toBe(0);
  });

  it('leaves a very short "key" out of the check, so ordinary words never stop an export', async () => {
    await device.services.secrets.set(seeded.providerIds[1]!, 'abc');
    a.client.exec(`UPDATE meal SET note = 'abc def' WHERE name = 'Oats'`);
    await expect(exportIt()).resolves.toBeDefined();
  });

  it('S4 still holds for the whole file in every form when nothing was pasted anywhere', async () => {
    await exportIt(true);
    for (const bytes of everyByteOf(lastShared(device).bytes)) {
      expect(bytes.includes(Buffer.from(DISTINCTIVE_KEY))).toBe(false);
      expect(bytes.includes(Buffer.from(encodeURIComponent(DISTINCTIVE_KEY)))).toBe(false);
    }
  });
});

describe('the result of the last connection test is exported only as a known code', () => {
  it.each([
    ['ok', 'ok'],
    ['auth_invalid', 'auth_invalid'],
    ['key_storage', 'key_storage'],
    ['some free text the provider sent back', null],
    [DISTINCTIVE_KEY, null],
  ])('%s → %s', async (stored, exported) => {
    a.client.exec(`UPDATE ai_provider SET last_test_result = '${stored}' WHERE label = 'Main'`);
    await exportIt();
    const doc = JSON.parse(strFromU8(lastShared(device).bytes));
    expect(doc.ai_providers.find((p: { label: string }) => p.label === 'Main').last_test_result).toBe(exported);
  });
});

describe('what the base URL keeps', () => {
  it('keeps a legitimate query string, and drops credentials that should never be there', async () => {
    a.client.exec(`UPDATE ai_provider SET base_url = 'https://api.example.com/openai?api-version=2024-02-01' WHERE label = 'Main'`);
    a.client.exec(`UPDATE ai_provider SET base_url = 'https://user:secret-pass@host.example.com/v1' WHERE label = 'Local'`);
    await exportIt();
    const doc = JSON.parse(strFromU8(lastShared(device).bytes));
    const urls = Object.fromEntries(doc.ai_providers.map((p: { label: string; base_url: string }) => [p.label, p.base_url]));
    expect(urls.Main).toBe('https://api.example.com/openai?api-version=2024-02-01');
    expect(urls.Local).toBe('https://host.example.com/v1');
  });
});

describe('an export that cannot be written says why instead of failing as a whole', () => {
  it('names the field whose stored value is larger than the format allows', async () => {
    a.client.exec(`UPDATE custom_food SET name = 'A${'x'.repeat(600)}' WHERE name = 'House oats'`); // sorts first, so it is custom_foods[0]
    await expectRefusedAt('custom_foods[0].name', 'invalid_value');
  });
});

describe('a kept photo that cannot be put in the file is reported', () => {
  it('lists the photos that are missing or unreadable, and exports the rest', async () => {
    await a.repos.meals.save({
      eatenAt: new Date('2026-06-05T10:00:00.000Z'),
      timeZone: 'UTC',
      slot: 'snack',
      source: 'scan',
      photoPath: 'photos/src-2.jpg',
      items: [{ displayName: 'Apple', grams: 100, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 } }],
    });
    await a.repos.meals.save({
      eatenAt: new Date('2026-06-06T10:00:00.000Z'),
      timeZone: 'UTC',
      slot: 'snack',
      source: 'scan',
      photoPath: 'photos/gone.jpg',
      items: [{ displayName: 'Pear', grams: 100, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 57, protein: 0.4, carbs: 15, fat: 0.1 } }],
    });
    device.platform.addPhoto('photos/src-2.jpg', jpeg(2));
    device.platform.state.failPhotoRead.add('photos/src-2.jpg');

    const result = await exportIt(true);
    expect(result.photos).toBe(1);
    expect([...result.skippedPhotos].sort()).toEqual(['photos/gone.jpg', 'photos/src-2.jpg']);
  });

  it('reports nothing skipped when every photo went in', async () => {
    const result = await exportIt(true);
    expect(result.skippedPhotos).toEqual([]);
  });
});
