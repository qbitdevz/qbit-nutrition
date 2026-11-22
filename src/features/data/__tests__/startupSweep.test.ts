/// <reference types="node" />
import { createHarness, type Harness } from '@/data/testing/harness';
import { dumpAll } from '../../testing/backupDump';
import { seedEverything, type Seeded } from '../../testing/backupSeed';
import { createDevice, fullState, jpeg, type Device } from '../../testing/dataKit';

let h: Harness;
let device: Device;
let seeded: Seeded;
beforeEach(async () => {
  h = await createHarness();
  device = createDevice(h);
  seeded = await seedEverything(h, { photoPath: 'photos/kept.jpg' });
  device.platform.addPhoto('photos/kept.jpg', jpeg(1)); // referenced by a meal
  await device.services.secrets.set(seeded.providerIds[0]!, 'key-of-a-profile-that-exists');
});
afterEach(() => {
  jest.useRealTimers();
  device.services.close();
  h.close();
});

describe('the startup sweep repairs what a crash or a failed cleanup left behind', () => {
  it('removes unreferenced photos, export and picker files, and keys without a profile, and nothing else', async () => {
    device.platform.addPhoto('photos/orphan-1.jpg', jpeg(2)); // an old photo after a crash, or a staged import file
    device.platform.addPhoto('photos/orphan-2.jpg', jpeg(3));
    await device.platform.cache.write('qbit-nutrition-export-2026-11-20.zip', jpeg(4));
    device.platform.state.nextPick = { name: 'left.json', bytes: jpeg(5) };
    await device.platform.picker.pick(); // a copy the picker made, never cleaned
    await device.services.secrets.set('orphan-key-id', 'key-without-a-profile-0123');

    const before = await fullState(device);
    const summary = await device.service.sweepStartup();

    const after = await fullState(device);
    expect(after.db).toEqual(before.db); // data is never touched
    expect(after.photos.map(([path]) => path)).toEqual(['photos/kept.jpg']);
    expect(after.keys).toEqual({ [seeded.providerIds[0]!]: 'key-of-a-profile-that-exists' });
    expect(device.platform.state.cache.size).toBe(0);
    expect(summary).toMatchObject({ photos: 2, keys: 1, files: 2, failed: [] });
  });

  it('does nothing when there is nothing to repair', async () => {
    const before = await fullState(device);
    expect(await device.service.sweepStartup()).toMatchObject({ photos: 0, keys: 0, files: 0, failed: [] });
    expect(await fullState(device)).toEqual(before);
  });

  it('adopts keys stored before the secure store kept an index, so they are not mistaken for orphans', async () => {
    const adopt = jest.spyOn(device.services.secrets, 'track');
    await device.service.sweepStartup();
    expect(adopt).toHaveBeenCalled();
    expect(await device.services.secrets.has(seeded.providerIds[0]!)).toBe(true);
  });

  it('one step failing does not stop the others, and it is reported', async () => {
    device.platform.addPhoto('photos/orphan-1.jpg', jpeg(2));
    device.platform.state.failPhotoRemove.add('photos/orphan-1.jpg');
    await device.services.secrets.set('orphan-key-id', 'key-without-a-profile-0123');
    const summary = await device.service.sweepStartup();
    expect(summary.failed).toEqual(['photos']);
    expect(await device.services.secrets.has('orphan-key-id')).toBe(false);
  });

  it('does not delete photos when the meals cannot be read to tell which are in use', async () => {
    device.platform.addPhoto('photos/orphan-1.jpg', jpeg(2));
    const real = h.repos.meals.photoPaths;
    h.repos.meals.photoPaths = async () => {
      throw new Error('disk');
    };
    const summary = await device.service.sweepStartup();
    h.repos.meals.photoPaths = real;
    expect(summary.failed).toContain('photos');
    expect([...device.platform.state.photos.keys()].sort()).toEqual(['photos/kept.jpg', 'photos/orphan-1.jpg']);
  });
});

describe('the export file (S3, S4)', () => {
  it('is removed the moment the share call returns when the platform says that is safe', async () => {
    jest.useFakeTimers();
    await device.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    expect(device.platform.state.shared).toHaveLength(1);
    expect(device.platform.state.cache.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0); // and nothing depends on a timer
  });

  it('is left for the startup sweep when the share call returns while a target may still be reading it', async () => {
    jest.useFakeTimers();
    device.platform.state.shareCompletesWhenDone = false;
    await device.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    expect([...device.platform.state.cache.keys()].filter((u) => u.includes('qbit-nutrition-export'))).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(24 * 60 * 60_000); // no timer is relied on, so time passing changes nothing
    expect(device.platform.state.cache.size).toBe(1);
    await device.service.sweepStartup(); // the next app start
    expect(device.platform.state.cache.size).toBe(0);
  });
});

describe('Delete all data (S3)', () => {
  const confirm = (confirmation: string) => ({ confirmation });

  it('refuses to run without the typed confirmation, and changes nothing', async () => {
    const before = await fullState(device);
    for (const options of [undefined, confirm(''), confirm('delete me'), confirm('DELET'), confirm('yes')]) {
      await expect(device.service.deleteAll(options as never)).rejects.toMatchObject({ code: 'not_confirmed' });
    }
    expect(await fullState(device)).toEqual(before);
  });

  it('accepts the confirmation word of either language, whatever its case', async () => {
    await device.service.deleteAll(confirm('borrar'));
    expect(await h.repos.profile.get()).toBeNull();
  });

  it('also removes keys that belong to no profile', async () => {
    await device.services.secrets.set('orphan-key-id', 'key-without-a-profile-0123');
    await device.service.deleteAll(confirm('DELETE'));
    expect(await device.services.secrets.list()).toEqual([]);
    expect(device.platform.state.photos.size).toBe(0);
    expect(Object.values(dumpAll(h)).flat().length).toBeGreaterThan(0); // only the migration bookkeeping is left
    expect(await h.repos.settings.getAll()).toEqual({});
  });
});

describe('an import reports a photo folder it cannot read instead of skipping it', () => {
  it('refuses before changing anything', async () => {
    const other = await createHarness();
    const source = createDevice(other);
    await seedEverything(other);
    await source.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const file = source.platform.state.shared[0]!;
    device.platform.state.nextPick = { name: file.name, bytes: file.bytes };
    const prepared = await device.service.prepareImport((await device.platform.picker.pick())!);
    const before = await fullState(device);
    device.platform.state.failPhotoList = true;
    await expect(device.service.applyImport(prepared)).rejects.toMatchObject({ code: 'storage_unreadable' });
    device.platform.state.failPhotoList = false;
    expect(await fullState(device)).toEqual(before);
    source.services.close();
    other.close();
  });
});
