/// <reference types="node" />
import { createHarness, type Harness } from '@/data/testing/harness';
import { SecretStoreError } from '@/platform/secretStore';
import { dumpAll } from '../../testing/backupDump';
import { DISTINCTIVE_KEY, seedEverything, type Seeded } from '../../testing/backupSeed';
import { createDevice, fullState, jpeg, type Device } from '../../testing/dataKit';

let h: Harness;
let device: Device;
let seeded: Seeded;
const CONFIRM = { confirmation: 'DELETE' };
beforeEach(async () => {
  h = await createHarness();
  device = createDevice(h);
  seeded = await seedEverything(h, { photoPath: 'photos/p1.jpg' });
  device.platform.addPhoto('photos/p1.jpg', jpeg(1));
  device.platform.addPhoto('photos/p2.jpg', jpeg(2));
  device.platform.addPhoto('photos/p3.jpg', jpeg(3));
  await device.services.secrets.set(seeded.providerIds[0]!, DISTINCTIVE_KEY);
  await device.services.secrets.set(seeded.providerIds[1]!, `${DISTINCTIVE_KEY}-2`);
});
afterEach(() => {
  jest.restoreAllMocks();
  device.services.close();
  h.close();
});

const outcome = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error as { code: string; [key: string]: unknown });

describe('"Delete all" says exactly what was and was not removed, and a retry finishes the rest (S3)', () => {
  it('a photo that cannot be removed: keys and the other photos are gone, the data is not, and the report has the numbers', async () => {
    device.platform.state.failPhotoRemove.add('photos/p2.jpg');
    const before = await fullState(device);
    const error = await outcome(device.service.deleteAll(CONFIRM));
    expect(error).toMatchObject({ code: 'delete_incomplete', stage: 'photos', keysRemoved: true, keysFailed: 0, photosRemoved: 2, photosFailed: 1, dataRemoved: false });

    const after = await fullState(device);
    expect(after.keys).toEqual({}); // gone
    expect(after.photos.map(([path]) => path)).toEqual(['photos/p2.jpg']); // only the one that failed
    expect(after.db).toEqual(before.db); // nothing deleted from the database

    device.platform.state.failPhotoRemove.clear();
    await expect(device.service.deleteAll(CONFIRM)).resolves.toEqual({ exportFilesLeft: false }); // retrying is safe and finishes
    expect((await fullState(device)).photos).toEqual([]);
    expect(await h.repos.profile.get()).toBeNull();
  });

  it('a key that cannot be removed: nothing else is deleted, and the report counts the keys', async () => {
    const remove = device.services.secrets.remove.bind(device.services.secrets);
    jest.spyOn(device.services.secrets, 'remove').mockImplementation(async (id) => {
      if (id === seeded.providerIds[0]) throw new Error('keystore');
      return remove(id);
    });
    const before = await fullState(device);
    const error = await outcome(device.service.deleteAll(CONFIRM));
    expect(error).toMatchObject({ code: 'delete_incomplete', stage: 'keys', keysFailed: 1, photosRemoved: 0, dataRemoved: false, keysUnlistable: false });
    const after = await fullState(device);
    expect(after.db).toEqual(before.db);
    expect(after.photos).toEqual(before.photos);
    expect(Object.keys(after.keys)).toEqual([seeded.providerIds[0]]); // the other key was removed, this one reported
  });

  it('the database failing last: keys and photos are gone, the data is not, and it says so', async () => {
    h.client.exec(`CREATE TRIGGER boom BEFORE DELETE ON setting BEGIN SELECT RAISE(ABORT, 'injected'); END`);
    const error = await outcome(device.service.deleteAll(CONFIRM));
    h.client.exec('DROP TRIGGER boom');
    expect(error).toMatchObject({ code: 'delete_incomplete', stage: 'data', keysRemoved: true, photosRemoved: 3, photosFailed: 0, dataRemoved: false });
    expect(await h.repos.profile.get()).not.toBeNull();
  });
});

describe('"Delete all" and the secure store that cannot be listed (S4)', () => {
  it('is not blocked when the storage is unavailable (it cannot hold a key), and removes everything else', async () => {
    jest.spyOn(device.services.secrets, 'list').mockRejectedValue(new SecretStoreError('unavailable', 'no secure storage'));
    await expect(device.service.deleteAll(CONFIRM)).resolves.toEqual({ exportFilesLeft: false });
    expect(await h.repos.profile.get()).toBeNull();
    expect(device.platform.state.photos.size).toBe(0);
  });

  it('is blocked, and says that the storage could not be read, when the failure is not "unavailable"', async () => {
    const dbBefore = dumpAll(h);
    jest.spyOn(device.services.secrets, 'list').mockRejectedValue(new SecretStoreError('failed', 'keystore broke'));
    const error = await outcome(device.service.deleteAll(CONFIRM));
    expect(error).toMatchObject({ code: 'delete_incomplete', stage: 'keys', keysUnlistable: true, photosRemoved: 0, dataRemoved: false });
    expect(dumpAll(h)).toEqual(dbBefore);
    expect(device.platform.state.photos.size).toBe(3);
  });

  it('still removes the keys it knows (those of the profiles) before saying it could not check for others', async () => {
    jest.spyOn(device.services.secrets, 'list').mockRejectedValue(new SecretStoreError('failed', 'keystore broke'));
    await outcome(device.service.deleteAll(CONFIRM));
    jest.restoreAllMocks();
    expect(await device.services.secrets.has(seeded.providerIds[0]!)).toBe(false);
    expect(await device.services.secrets.has(seeded.providerIds[1]!)).toBe(false);
  });
});
