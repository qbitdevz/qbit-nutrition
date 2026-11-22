import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { strToU8 } from 'fflate';
import { Text } from 'react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { AppSession, useSession } from '../../session/AppSession';
import { seedEverything } from '../../testing/backupSeed';
import { createDevice, jpeg, lastShared, type Device } from '../../testing/dataKit';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { validDocument } from '../../testing/validDocument';
import { DataPlatformProvider } from '../DataPlatformContext';
import { DataScreen } from '../DataScreen';

let h: Harness;
let a: Harness;
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
  jest.restoreAllMocks();
  await cleanup();
  services.close();
  source.services.close();
  h.close();
  a.close();
  await i18n.changeLanguage('en');
});

const press = async (name: string | RegExp) => await fireEvent.press(screen.getByRole('button', { name }));
const Probe = () => <Text testID="probe">{useSession().onboarded ? 'onboarded' : 'first launch'}</Text>;

async function open(locale: 'en' | 'es' = 'en', props: Partial<Parameters<typeof DataScreen>[0]> = {}) {
  await renderApp(
    <DataPlatformProvider platform={platform}>
      <AppSession>
        <Probe />
        <DataScreen {...props} />
      </AppSession>
    </DataPlatformProvider>,
    { services, locale },
  );
  await screen.findByTestId('probe');
}

async function onboardAndSeed() {
  await seedEverything(h, { photoPath: 'photos/p1.jpg' });
  await h.repos.settings.set('locale', 'en');
  await h.repos.settings.set('onboarding_completed_at', '2026-11-20T09:01:00.000Z');
  platform.addPhoto('photos/p1.jpg', jpeg(1));
}

async function exportedFile(language: 'en' | 'es' = 'en') {
  await seedEverything(a, { photoPath: 'photos/src-1.jpg' });
  await a.repos.settings.set('locale', language);
  source.platform.addPhoto('photos/src-1.jpg', jpeg(1));
  await source.service.exportData({ withPhotos: true, shareTitle: 'Export' });
  const file = lastShared(source);
  return { name: file.name, bytes: file.bytes };
}

describe('A1 — an export that stops names the meal and offers to open it', () => {
  it('names the meal by date and name, and the button opens it', async () => {
    await onboardAndSeed();
    const [{ id }] = h.client.prepare(`SELECT id FROM meal WHERE name = 'Oats'`).all() as { id: string }[];
    h.client.exec(`UPDATE meal SET local_date = '2031-03-04', eaten_at = '2031-03-04T10:00:00.000Z' WHERE id = '${id}'`);
    const onOpenMeal = jest.fn();
    await open('en', { onOpenMeal });
    await press('Export data');
    await press('Share file');
    expect(await screen.findByText(/meal “Oats” on Mar 4, 2031 has a date this app cannot export/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open this meal' }));
    expect(onOpenMeal).toHaveBeenCalledWith(id);
    expect(platform.state.shared).toHaveLength(0);
  });

  it('says that dates written while the phone’s clock was wrong were corrected', async () => {
    await onboardAndSeed();
    h.client.exec(`UPDATE food_usage SET last_used_at = '2031-01-01T00:00:00.000Z'`);
    await open();
    await press('Export data');
    await press('Share file');
    expect(await screen.findByText(/dates written while this phone’s clock was wrong were corrected in the file/)).toBeOnTheScreen();
    expect(platform.state.shared).toHaveLength(1);
  });
});

describe('A1 — an import refused because of the phone’s date says so', () => {
  it('names the phone date and the file date, and says what to do', async () => {
    await h.repos.settings.set('onboarding_completed_at', '2026-11-20T09:01:00.000Z');
    platform.state.nextPick = { name: 'x.json', bytes: strToU8(JSON.stringify(validDocument())) };
    await open('en', { now: () => new Date('2026-01-01T00:00:00.000Z') });
    await press('Choose a file');
    expect(await screen.findByText(/This phone’s date is Jan 1, 2026, but the file was exported on Nov 21, 2026\. If this phone’s date is wrong/)).toBeOnTheScreen();
    expect(screen.getByText('Your current data was not changed.')).toBeOnTheScreen();
  });
});

describe('A3 — a file that is too large is refused before sharing, with what to do', () => {
  async function limitedToTheDocumentAlone() {
    // The same data as a plain file just fits; with the photo (and its path in the document) it does not.
    const probe = createDevice(h);
    await probe.service.exportData({ withPhotos: false, shareTitle: 'Export' });
    const plain = lastShared(probe).bytes.byteLength;
    probe.services.close();
    return { maxTotalBytes: plain + 5 };
  }

  it('the photos make it too large: says so, says how to fix it, and shares nothing', async () => {
    await onboardAndSeed();
    await open('en', { limits: await limitedToTheDocumentAlone() });
    await fireEvent.press(await screen.findByRole('radio', { name: /With 1 photo/ }));
    await press('Export data');
    await press('Share file');
    expect(await screen.findByText(/too large for one file with the photos/)).toBeOnTheScreen();
    expect(screen.getByText(/Choose “Without photos”/)).toBeOnTheScreen();
    expect(platform.state.shared).toHaveLength(0);
  });

  it('without the photos the same data exports', async () => {
    await onboardAndSeed();
    await open('en', { limits: await limitedToTheDocumentAlone() });
    await press('Export data');
    await press('Share file');
    expect(await screen.findByText(/Export shared: qbit-nutrition-export-/)).toBeOnTheScreen();
  });

  it('the data itself is too large: says the limit and the advice', async () => {
    await onboardAndSeed();
    await open('en', { limits: { maxDocumentBytes: 2000 } });
    await press('Export data');
    await press('Share file');
    expect(await screen.findByText(/too large for one file/)).toBeOnTheScreen();
    expect(screen.getByText(/Remove imported food tables you no longer use/)).toBeOnTheScreen();
    expect(platform.state.shared).toHaveLength(0);
  });
});

describe('A4 — "Delete all data" states what was removed', () => {
  it('only listing orphan keys failed: it says how many keys were removed, never "nothing was deleted"', async () => {
    await onboardAndSeed();
    const [p1, p2] = (await h.repos.aiProviders.list()).map((p) => p.id);
    await services.secrets.set(p1!, 'key-one-123456');
    await services.secrets.set(p2!, 'key-two-123456');
    jest.spyOn(services.secrets, 'list').mockRejectedValue(new Error('keystore broke'));
    await open();
    await press('Delete all data');
    await fireEvent.changeText(screen.getByTestId('confirm-word'), 'DELETE');
    await press('Delete everything');
    expect(await screen.findByText(/Removed: 2 AI provider keys\. The secure key storage could not be read, so other keys could not be checked\. Not removed: your data and photos\./)).toBeOnTheScreen();
    expect(screen.queryByText(/Nothing was deleted/)).not.toBeOnTheScreen();
  });

  it('a leftover export file is reported after a successful delete, and "Continue" then goes to the first launch', async () => {
    await onboardAndSeed();
    platform.state.shareCompletesWhenDone = false;
    await open();
    await press('Export data');
    await press('Share file');
    await screen.findByText(/Export shared: qbit-nutrition-export-/);
    const remove = platform.cache.remove.bind(platform.cache);
    jest.spyOn(platform.cache, 'remove').mockImplementation(async (uri) => {
      if (uri.includes('qbit-nutrition-export-')) throw new Error('locked');
      return remove(uri);
    });
    await press('Delete all data');
    await fireEvent.changeText(screen.getByTestId('confirm-word'), 'DELETE');
    await press('Delete everything');
    expect(await screen.findByText(/Your data was deleted, but a copy of an earlier export could not be removed/)).toBeOnTheScreen();
    expect(await h.repos.profile.get()).toBeNull();
    expect(screen.getByTestId('probe').props.children).toBe('onboarded'); // the person has read it before the app resets
    await press('Continue');
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('first launch'));
  });
});

describe('A8 — the replace warning names everything that is lost, with the counts on both sides', () => {
  it('lists what goes and shows "on this phone now" next to "in the file"', async () => {
    await onboardAndSeed();
    platform.state.nextPick = await exportedFile();
    await open();
    await press('Choose a file');
    await screen.findByText('Replace your data?');
    const warning = screen.getByTestId('replace-warning');
    const text = String(warning.props.children);
    for (const word of ['imported food tables', 'kept meal photos', 'favorites and recents', 'learned matches', 'barcode', 'AI provider profiles']) expect(text).toContain(word);
    expect(screen.getByText('On this phone now')).toBeOnTheScreen();
    expect(screen.getByText('In the file')).toBeOnTheScreen();
    expect(screen.getByLabelText('Imported food tables: 1 on this phone now, 1 in the file')).toBeOnTheScreen();
    expect(screen.getByLabelText('Barcode products: 3 on this phone now, 2 in the file')).toBeOnTheScreen();
    expect(screen.getByTestId('count-favoritesAndRecents')).toBeOnTheScreen();
    expect(screen.getByTestId('count-barcodeProducts')).toBeOnTheScreen();
  });

  it('says which host every imported provider points to, and that it must be checked before use', async () => {
    await onboardAndSeed();
    platform.state.nextPick = await exportedFile();
    await open();
    await press('Choose a file');
    expect(await screen.findByText(/Main → api\.example\.com/)).toBeOnTheScreen();
    expect(screen.getByText(/Local → 192\.168\.1\.5:11434/)).toBeOnTheScreen();
    expect(screen.getByText(/Check each address before you use a profile/)).toBeOnTheScreen();
  });

  it('is available in Spanish too', async () => {
    await onboardAndSeed();
    await h.repos.settings.set('locale', 'es');
    platform.state.nextPick = await exportedFile('es');
    await open('es');
    await press('Elegir un archivo');
    expect(await screen.findByText('En este teléfono ahora')).toBeOnTheScreen();
    expect(screen.getByText('En el archivo')).toBeOnTheScreen();
    expect(screen.getByText(/Revisa cada dirección antes de usar un perfil/)).toBeOnTheScreen();
  });
});

describe('A10 — the import shows which step it is on', () => {
  it('shows the photo being stored, then the write', async () => {
    await onboardAndSeed();
    platform.state.nextPick = await exportedFile();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const write = platform.photos.write.bind(platform.photos);
    jest.spyOn(platform.photos, 'write').mockImplementation(async (bytes) => {
      await gate;
      return write(bytes);
    });
    await open();
    await press('Choose a file');
    await press('Replace my data');
    expect(await screen.findByText('Importing: saving photo 1 of 1')).toBeOnTheScreen();
    release();
    expect(await screen.findByText('Data imported')).toBeOnTheScreen();
  });
});
