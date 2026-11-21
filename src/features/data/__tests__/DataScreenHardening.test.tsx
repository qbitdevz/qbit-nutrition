import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { strToU8 } from 'fflate';
import { Text } from 'react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { AppSession, useSession } from '../../session/AppSession';
import { dumpAll } from '../../testing/backupDump';
import { DISTINCTIVE_KEY, seedEverything } from '../../testing/backupSeed';
import { createDevice, fullState, jpeg, lastShared, type Device } from '../../testing/dataKit';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { DataPlatformProvider } from '../DataPlatformContext';
import { DataScreen } from '../DataScreen';
import { StartupSweep } from '../StartupSweep';

let h: Harness; // this phone
let a: Harness; // where a file comes from
let source: Device;
let services: ReturnType<typeof createTestServices>;
let platform: FakeDataPlatform;
beforeEach(async () => {
  h = await createHarness();
  a = await createHarness();
  source = createDevice(a);
  services = createTestServices(h);
  platform = createFakeDataPlatform();
});
afterEach(async () => {
  jest.restoreAllMocks(); // first: a mocked changeLanguage must not break the reset below
  await cleanup();
  services.close();
  source.services.close();
  h.close();
  a.close();
  await i18n.changeLanguage('en');
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const Probe = () => <Text testID="probe">{useSession().onboarded ? 'onboarded' : 'first launch'}</Text>;

async function onboard() {
  await h.repos.profile.save({ sex: 'male', birthDate: '1985-02-02', heightCm: 180, activityLevel: 'light', unitSystem: 'imperial', locale: 'en', disclaimerAcceptedAt: '2026-11-20T09:00:00.000Z', disclaimerVersion: '2026-11-21' });
  await h.repos.settings.set('onboarding_completed_at', '2026-11-20T09:01:00.000Z');
  await h.repos.settings.set('locale', 'en');
}

async function open(locale: 'en' | 'es' = 'en') {
  const view = await renderApp(
    <DataPlatformProvider platform={platform}>
      <AppSession>
        <Probe />
        <DataScreen />
      </AppSession>
    </DataPlatformProvider>,
    { services, locale },
  );
  await screen.findByTestId('probe');
  return view;
}

/** A document exported from `source`, edited by `change`, as the file the person picks. */
async function pickEdited(change: (doc: any) => void, language: 'en' | 'es' = 'en') {
  await seedEverything(a);
  await a.repos.settings.set('locale', language);
  await source.service.exportData({ withPhotos: false, shareTitle: 'Export' });
  const doc = JSON.parse(new TextDecoder().decode(lastShared(source).bytes));
  change(doc);
  platform.state.nextPick = { name: 'edited.json', bytes: strToU8(JSON.stringify(doc)) };
}

describe('a file with no profile (S3)', () => {
  it('leaves this installation’s profile in place, so the app stays onboarded and coherent', async () => {
    await onboard();
    const profileBefore = await h.repos.profile.get();
    await pickEdited((doc) => (doc.profile = null));
    await open();
    await press('Choose a file');
    expect(await screen.findByText('It has no profile: the one on this phone stays.')).toBeOnTheScreen();
    await press('Replace my data');
    expect(await screen.findByText('Data imported')).toBeOnTheScreen();

    expect(await h.repos.profile.get()).toEqual(profileBefore);
    expect((await h.repos.settings.getAll()).onboarding_completed_at).toBe('2026-11-20T09:01:00.000Z');
    expect(screen.getByTestId('probe').props.children).toBe('onboarded');
    expect((await h.repos.meals.totalsByDay('2026-06-01', '2026-06-30')).length).toBe(3); // and the rest of the file was imported
  });
});

describe('what happens after the data is replaced is never reported as "not changed" (S3)', () => {
  it('a failure while switching language still shows the import as done', async () => {
    await onboard();
    await pickEdited(() => undefined, 'es'); // the file is Spanish, so the language has to change
    await open();
    jest.spyOn(i18n, 'changeLanguage').mockRejectedValue(new Error('no language'));
    await press('Choose a file');
    await press('Replace my data');
    expect(await screen.findByText('Data imported')).toBeOnTheScreen();
    expect(screen.queryByText('This file cannot be imported')).not.toBeOnTheScreen();
    expect(screen.queryByText('Your current data was not changed.')).not.toBeOnTheScreen();
    expect((await h.repos.meals.totalsByDay('2026-06-01', '2026-06-30')).length).toBe(3);
  });

  it('a failure before the commit is reported with its specific message, and nothing is changed', async () => {
    await onboard();
    await seedEverything(h);
    await h.repos.settings.set('locale', 'en');
    await pickEdited(() => undefined);
    await open();
    await press('Choose a file');
    await screen.findByText('Replace your data?');
    const before = dumpAll(h);
    platform.state.failPhotoList = true;
    await press('Replace my data');
    expect(await screen.findByText(/could not be read, so nothing could be replaced safely/)).toBeOnTheScreen();
    expect(screen.getByText('Your current data was not changed.')).toBeOnTheScreen();
    expect(dumpAll(h)).toEqual(before);
  });

  it('a file that would unpack to too much says so', async () => {
    await onboard();
    await pickEdited(() => undefined);
    const huge = strToU8(JSON.stringify({ format: 'qbit-nutrition-export', format_version: 1, padding: 'x'.repeat(70 * 1024 * 1024) }));
    platform.state.nextPick = { name: 'huge.json', bytes: huge };
    await open();
    await press('Choose a file');
    expect(await screen.findByText(/would unpack to more than this app accepts/)).toBeOnTheScreen();
  });
});

describe('Delete all data returns the language to the device’s', () => {
  it('after the data is gone the app speaks the device language again, not the one that was chosen', async () => {
    await onboard();
    await h.repos.settings.set('locale', 'es');
    await open('es');
    expect(i18n.language).toBe('es');
    await press('Borrar todos los datos');
    await fireEvent.changeText(screen.getByTestId('confirm-word'), 'BORRAR');
    await press('Borrar todo');
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('first launch'));
    expect(i18n.language).toBe('en'); // the device language in the test environment
  });
});

describe('an export that stops says why (S4)', () => {
  it('names the field that holds an API key, and shares nothing', async () => {
    await onboard();
    const seeded = await seedEverything(h);
    await h.repos.settings.set('locale', 'en');
    await services.secrets.set(seeded.providerIds[0]!, DISTINCTIVE_KEY);
    h.client.exec(`UPDATE ai_provider SET label = 'Main ${DISTINCTIVE_KEY}' WHERE label = 'Main'`);
    const before = await fullState({ h, platform, services });
    await open();
    await press('Export data');
    await press('Share file');
    expect(await screen.findByText(/The export was stopped: ai_providers\[1\]\.label contains an API key/)).toBeOnTheScreen();
    expect(platform.state.shared).toHaveLength(0);
    expect(await fullState({ h, platform, services })).toEqual(before);
  });

  it('says how many photos are not in the file', async () => {
    await onboard();
    await seedEverything(h, { photoPath: 'photos/gone.jpg' });
    await h.repos.settings.set('locale', 'en');
    platform.addPhoto('photos/other.jpg', jpeg(1)); // one photo on disk, so "with photos" is offered; the meal's own is missing
    await open();
    await fireEvent.press(await screen.findByRole('radio', { name: 'With 1 photo' }));
    await press('Export data');
    await press('Share file');
    expect(await screen.findByText(/1 meal photo could not be read and is not in the file/)).toBeOnTheScreen();
  });
});

describe('the startup sweep', () => {
  it('runs when the app starts and removes what a crash left behind', async () => {
    await onboard();
    const seeded = await seedEverything(h, { photoPath: 'photos/kept.jpg' });
    platform.addPhoto('photos/kept.jpg', jpeg(1));
    platform.addPhoto('photos/orphan.jpg', jpeg(2));
    await platform.cache.write('qbit-nutrition-export-old.zip', jpeg(3));
    await services.secrets.set('orphan-key-id', 'a-key-without-a-profile');
    await services.secrets.set(seeded.providerIds[0]!, 'a-key-of-a-profile');

    await renderApp(
      <DataPlatformProvider platform={platform}>
        <StartupSweep />
      </DataPlatformProvider>,
      { services },
    );
    await waitFor(() => expect([...platform.state.photos.keys()]).toEqual(['photos/kept.jpg']));
    await waitFor(async () => expect(await services.secrets.list()).toEqual([seeded.providerIds[0]]));
    expect(platform.state.cache.size).toBe(0);
  });
});
