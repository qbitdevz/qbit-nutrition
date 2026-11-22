import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { createFakeHealthPlatform, type FakeHealthPlatform } from '@/platform/fakeHealthPlatform';
import { SecretStoreError } from '@/platform/secretStore';
import { createHealthSync, type HealthSync } from '../../health/healthSync';
import { AppSession, useSession } from '../../session/AppSession';
import { dumpAll } from '../../testing/backupDump';
import { seedEverything } from '../../testing/backupSeed';
import { jpeg } from '../../testing/dataKit';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { DataPlatformProvider } from '../DataPlatformContext';
import { DataScreen } from '../DataScreen';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let platform: FakeDataPlatform;
let healthPlatform: FakeHealthPlatform;
let health: HealthSync;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
  platform = createFakeDataPlatform();
  healthPlatform = createFakeHealthPlatform();
  health = createHealthSync({ repos: h.repos, platform: healthPlatform, now: () => new Date('2026-06-15T12:00:00.000Z') });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const Probe = () => <Text testID="probe">{useSession().onboarded ? 'onboarded' : 'first launch'}</Text>;

async function onboardAndSeed() {
  const seeded = await seedEverything(h, { photoPath: 'photos/p1.jpg' });
  await h.repos.settings.set('locale', 'en');
  await h.repos.settings.set('onboarding_completed_at', '2026-11-20T09:01:00.000Z');
  platform.addPhoto('photos/p1.jpg', jpeg(1));
  platform.addPhoto('photos/p2.jpg', jpeg(2));
  platform.addPhoto('photos/p3.jpg', jpeg(3));
  return seeded;
}

async function open(withHealth = false) {
  await renderApp(
    <DataPlatformProvider platform={platform}>
      <AppSession>
        <Probe />
        <DataScreen />
      </AppSession>
    </DataPlatformProvider>,
    { services: withHealth ? { ...services, health } : services },
  );
  await screen.findByTestId('probe');
}

async function deleteEverything() {
  await press('Delete all data');
  await fireEvent.changeText(screen.getByTestId('confirm-word'), 'DELETE');
  await press('Delete everything');
}

describe('the outcome of "Delete all data" is stated exactly (S3)', () => {
  it('a photo that cannot be removed: what is gone, what is not, and that trying again is safe', async () => {
    await onboardAndSeed();
    platform.state.failPhotoRemove.add('photos/p2.jpg');
    await open();
    await deleteEverything();
    expect(await screen.findByText(/Removed: your AI provider keys and 2 of 3 meal photos\. Not removed: 1 meal photo and all your data\. Trying again is safe/)).toBeOnTheScreen();
    expect(screen.queryByText(/Your data is still here/)).not.toBeOnTheScreen(); // the old, untrue sentence
    expect(await h.repos.profile.get()).not.toBeNull();
    expect(screen.getByTestId('probe').props.children).toBe('onboarded');

    platform.state.failPhotoRemove.clear();
    await press('Delete everything');
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('first launch'));
  });

  it('keys that could not be removed: nothing else was deleted', async () => {
    const seeded = await onboardAndSeed();
    await services.secrets.set(seeded.providerIds[0]!, 'a-key-that-will-not-go-0123');
    const remove = services.secrets.remove.bind(services.secrets);
    jest.spyOn(services.secrets, 'remove').mockImplementation(async (id) => {
      if (id === seeded.providerIds[0]) throw new Error('keystore');
      return remove(id);
    });
    await open();
    await deleteEverything();
    expect(await screen.findByText(/1 of your AI provider keys could not be removed\. Nothing else was deleted\. Trying again is safe/)).toBeOnTheScreen();
  });

  it('a secure store that cannot be read says that, and nothing was deleted', async () => {
    await onboardAndSeed();
    const dbBefore = dumpAll(h);
    jest.spyOn(services.secrets, 'list').mockRejectedValue(new SecretStoreError('failed', 'keystore broke'));
    await open();
    await deleteEverything();
    expect(await screen.findByText(/The secure key storage could not be read, so your AI provider keys could not be checked\. Nothing was deleted/)).toBeOnTheScreen();
    expect(dumpAll(h)).toEqual(dbBefore);
    expect(platform.state.photos.size).toBe(3);
  });

  it('the database failing last: keys and photos are gone and it says the data is not', async () => {
    await onboardAndSeed();
    h.client.exec(`CREATE TRIGGER boom BEFORE DELETE ON setting BEGIN SELECT RAISE(ABORT, 'injected'); END`);
    await open();
    await deleteEverything();
    expect(await screen.findByText(/Removed: your AI provider keys and all meal photos\. Not removed: your data could not be cleared\. Trying again is safe/)).toBeOnTheScreen();
    expect(platform.state.photos.size).toBe(0);
  });
});

describe('Health Connect and "Delete all data" (S3, S7)', () => {
  async function enableHealth() {
    await health.turnOn();
    healthPlatform.state.records.set('meal-1', { clientRecordId: 'meal-1' } as never);
  }

  it('says the Health Connect records were removed when the wipe then fails', async () => {
    await onboardAndSeed();
    await enableHealth();
    h.client.exec(`CREATE TRIGGER boom BEFORE DELETE ON setting BEGIN SELECT RAISE(ABORT, 'injected'); END`);
    await open(true);
    await deleteEverything();
    expect(await screen.findByText(/The records this app wrote to Health Connect were removed\./)).toBeOnTheScreen();
    expect(healthPlatform.state.records.size).toBe(0);
    expect(await h.repos.profile.get()).not.toBeNull();
  });

  it('when Health Connect refuses, nothing is deleted and the message says so', async () => {
    await onboardAndSeed();
    await enableHealth();
    healthPlatform.state.failDeletes = 1;
    await open(true);
    await deleteEverything();
    expect(await screen.findByText(/The records in Health Connect could not be removed, so nothing was deleted/)).toBeOnTheScreen();
    expect(platform.state.photos.size).toBe(3);
    expect(await h.repos.profile.get()).not.toBeNull();
  });

  it('a weight sync in flight cannot add rows after the wipe', async () => {
    await onboardAndSeed();
    healthPlatform.state.weights = [{ time: '2026-06-14T09:00:00.000Z', kg: 71 }];
    await health.turnOn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const readWeights = healthPlatform.readWeights.bind(healthPlatform);
    healthPlatform.readWeights = async (range) => {
      await gate;
      return readWeights(range);
    };
    await open(true);
    const sync = health.syncWeight(); // under way when the person confirms
    await deleteEverything();
    release();
    await sync;
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('first launch'));
    expect(await h.repos.measurements.list('weight')).toEqual([]);
  });
});

describe('an export says what it left out (S3)', () => {
  it('names the rows that were skipped because their values are outside what the app accepts', async () => {
    await onboardAndSeed();
    h.client.exec(`INSERT INTO body_measurement (id, measured_on, kind, value, source) VALUES ('hc-bad', '2026-06-04', 'weight', 12.5, 'health_connect')`);
    await open();
    await press('Export data');
    await press('Share file');
    expect(await screen.findByText(/1 entry was left out of the file because its value is outside what the app accepts: weight 2026-06-04\. The rest was exported\./)).toBeOnTheScreen();
    expect(platform.state.shared).toHaveLength(1);
  });
});
