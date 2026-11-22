/// <reference types="node" />
import { createHarness, type Harness } from '@/data/testing/harness';
import { seedEverything } from '../../testing/backupSeed';
import { createDevice, jpeg, NOW, type Device } from '../../testing/dataKit';

let h: Harness;
let device: Device;
beforeEach(async () => {
  h = await createHarness();
  device = createDevice(h);
  await seedEverything(h, { photoPath: 'photos/kept.jpg' });
  device.platform.addPhoto('photos/kept.jpg', jpeg(1));
});
afterEach(() => {
  jest.restoreAllMocks();
  device.services.close();
  h.close();
});

describe('the startup sweep does not race with what the person is doing (S3, S4)', () => {
  it('keeps the key of a profile created while the sweep was looking (keys are listed first, then profiles)', async () => {
    // A profile and its key appear right after whichever of the two reads the sweep makes first.
    let created = false;
    const createProfileWithKey = async () => {
      if (created) return;
      created = true;
      const profile = await h.repos.aiProviders.create({ label: 'Created meanwhile', preset: null, adapter: 'openai_compatible', baseUrl: 'https://new.example.com/v1', model: 'm', timeoutS: 30 });
      await device.services.secrets.set(profile.id, 'key-of-a-profile-created-during-the-sweep');
    };
    const listKeys = device.services.secrets.list.bind(device.services.secrets);
    jest.spyOn(device.services.secrets, 'list').mockImplementation(async () => {
      const keys = await listKeys();
      await createProfileWithKey();
      return keys;
    });
    const listRows = h.repos.aiProviders.list.bind(h.repos.aiProviders);
    jest.spyOn(h.repos.aiProviders, 'list').mockImplementation(async () => {
      const rows = await listRows();
      await createProfileWithKey();
      return rows;
    });

    await device.service.sweepStartup();
    jest.restoreAllMocks();
    const rows = await h.repos.aiProviders.list();
    const fresh = rows.find((r) => r.label === 'Created meanwhile')!;
    expect(await device.services.secrets.get(fresh.id)).toBe('key-of-a-profile-created-during-the-sweep');
  });

  it('leaves a photo that was kept a moment ago: its meal may not be saved yet', async () => {
    device.platform.addPhoto('photos/just-kept.jpg', jpeg(2), NOW.getTime() - 30_000);
    const summary = await device.service.sweepStartup();
    expect(device.platform.state.photos.has('photos/just-kept.jpg')).toBe(true);
    expect(summary.photos).toBe(0);
  });

  it('removes an unreferenced photo once it is old enough that no save can be waiting for it', async () => {
    device.platform.addPhoto('photos/old-orphan.jpg', jpeg(3), NOW.getTime() - 11 * 60_000);
    const summary = await device.service.sweepStartup();
    expect(device.platform.state.photos.has('photos/old-orphan.jpg')).toBe(false);
    expect(summary.photos).toBe(1);
  });

  it('never removes a photo a meal refers to, however old', async () => {
    device.platform.addPhoto('photos/kept.jpg', jpeg(1), 5);
    await device.service.sweepStartup();
    expect(device.platform.state.photos.has('photos/kept.jpg')).toBe(true);
  });
});
