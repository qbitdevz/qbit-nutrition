import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { strToU8 } from 'fflate';
import { Text } from 'react-native';

import { dumpAll } from '../../testing/backupDump';
import { seedEverything } from '../../testing/backupSeed';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { AppSession, useSession } from '../../session/AppSession';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { DataPlatformProvider } from '../DataPlatformContext';
import { DataScreen } from '../DataScreen';
import { createDevice, jpeg, lastShared, type Device } from '../../testing/dataKit';

let h: Harness; // this phone
let a: Harness; // the phone a file comes from
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
  await cleanup();
  services.close();
  source.services.close();
  h.close();
  a.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

function Probe() {
  const { onboarded } = useSession();
  return <Text testID="probe">{onboarded ? 'onboarded' : 'first launch'}</Text>;
}

/** The shared seed is in Spanish; this phone's screens are read in English unless a test says otherwise. */
async function seedHere(options: Parameters<typeof seedEverything>[1] = {}) {
  const seeded = await seedEverything(h, options);
  await h.repos.settings.set('locale', 'en');
  return seeded;
}

/** This phone went through onboarding: it has its own profile and the onboarding mark. */
async function onboard() {
  await h.repos.profile.save({ unitSystem: 'metric', locale: 'en', disclaimerAcceptedAt: '2026-11-20T09:00:00.000Z', disclaimerVersion: '2026-11-21' });
  await h.repos.settings.set('onboarding_completed_at', '2026-11-20T09:01:00.000Z');
}

async function open(locale: 'en' | 'es' = 'en', props: Partial<Parameters<typeof DataScreen>[0]> = {}) {
  const view = await renderApp(
    <DataPlatformProvider platform={platform}>
      <AppSession>
        <Probe />
        <DataScreen {...props} />
      </AppSession>
    </DataPlatformProvider>,
    { services, locale },
  );
  await screen.findByTestId('probe'); // the session has read its settings
  return view;
}

/** A real export from `source` as the file the person will pick. */
async function exportedFile(options: { withPhotos?: boolean; language?: 'en' | 'es' } = {}) {
  await seedEverything(a, { photoPath: 'photos/src-1.jpg' });
  await a.repos.settings.set('locale', options.language ?? 'en'); // the seed is Spanish; most tests read English
  source.platform.addPhoto('photos/src-1.jpg', jpeg(1));
  await source.service.exportData({ withPhotos: options.withPhotos ?? false, shareTitle: 'Export' });
  const file = lastShared(source);
  return { name: file.name, bytes: file.bytes };
}

describe('Settings → Data: export (S3)', () => {
  it('shows the three actions of flow F', async () => {
    await onboard();
    await open();
    expect(await screen.findByRole('button', { name: 'Export data' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete all data' })).toBeOnTheScreen();
  });

  it('shows the reminder first, and shares only after the person agrees', async () => {
    await onboard();
    await seedHere();
    await open();
    await press('Export data');
    expect(await screen.findByText('Before you share it')).toBeOnTheScreen();
    expect(screen.getByText(/contains your health data and is not encrypted/)).toBeOnTheScreen();
    expect(platform.state.shared).toHaveLength(0);
    expect(platform.state.cache.size).toBe(0);

    await press('Share file');
    await waitFor(() => expect(platform.state.shared).toHaveLength(1));
    expect(platform.state.shared[0]!.name).toMatch(/^qbit-nutrition-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(await screen.findByText(/Export shared: qbit-nutrition-export-/)).toBeOnTheScreen();
  });

  it('cancelling at the reminder shares and writes nothing', async () => {
    await onboard();
    await seedHere();
    await open();
    await press('Export data');
    await press('Cancel');
    expect(platform.state.shared).toHaveLength(0);
    expect(platform.state.cache.size).toBe(0);
    await waitFor(() => expect(screen.queryByText('Before you share it')).not.toBeOnTheScreen());
  });

  it('offers the photos only when there are some, and then shares a ZIP', async () => {
    await onboard();
    const seeded = await seedHere({ photoPath: 'photos/here-1.jpg' });
    void seeded;
    await open();
    expect(screen.queryByRole('radio', { name: /With \d+ photo/ })).not.toBeOnTheScreen(); // none on disk yet
    await cleanup();

    platform.addPhoto('photos/here-1.jpg', jpeg(3));
    await open();
    expect(await screen.findByRole('radio', { name: 'Without photos' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'With 1 photo' }));
    await press('Export data');
    await press('Share file');
    await waitFor(() => expect(platform.state.shared).toHaveLength(1));
    expect(platform.state.shared[0]!.name.endsWith('.zip')).toBe(true);
  });

  it('says when the file could not be shared, shares nothing, and leaves no file behind', async () => {
    await onboard();
    await seedHere();
    platform.state.failShare = true;
    await open();
    await press('Export data');
    await press('Share file');
    expect(await screen.findByText(/The export could not be created or shared/)).toBeOnTheScreen();
    expect(platform.state.cache.size).toBe(0);
    // Trying again is one tap.
    platform.state.failShare = false;
    await press('Export data');
    await press('Share file');
    await waitFor(() => expect(platform.state.shared).toHaveLength(1));
  });
});

describe('Settings → Data: import (S3)', () => {
  it('shows what the file holds and replaces the data only after the person confirms', async () => {
    await onboard();
    const file = await exportedFile();
    platform.state.nextPick = file;
    await open();
    await press('Choose a file');

    expect(await screen.findByText('Replace your data?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Meals: 0 on this phone now, 3 in the file')).toBeOnTheScreen();
    expect(screen.getByLabelText('Weight entries: 0 on this phone now, 3 in the file')).toBeOnTheScreen();
    expect(screen.getByLabelText('Body measurements: 0 on this phone now, 2 in the file')).toBeOnTheScreen();
    expect(screen.getByLabelText('AI providers: 0 on this phone now, 2 in the file')).toBeOnTheScreen();
    expect(screen.getByText(/Exported on .* with app version 1\.0\.0/)).toBeOnTheScreen();
    expect(screen.getByText('Covers Jun 1, 2026 to Jun 3, 2026.')).toBeOnTheScreen();
    expect(screen.getByText(/^Importing replaces everything on this phone/)).toBeOnTheScreen();
    expect(screen.getByText(/health notice you accepted on this phone stays/)).toBeOnTheScreen();
    // Nothing has been written yet.
    expect((await h.repos.meals.totalsByDay('2026-06-01', '2026-06-30')).length).toBe(0);

    await press('Replace my data');
    expect(await screen.findByText('Data imported')).toBeOnTheScreen();
    expect((await h.repos.meals.totalsByDay('2026-06-01', '2026-06-30')).length).toBe(3);
    expect(screen.getByText('3 meals were imported.')).toBeOnTheScreen();
    // Providers come without keys: said, and one tap leads to where a key is added.
    expect(screen.getByText('2 AI providers need their key again.')).toBeOnTheScreen();
    const providers = (await services.providers.list()).map((p) => p.hasKey);
    expect(providers).toEqual([false, false]);
  });

  it('opens the AI providers from the result', async () => {
    await onboard();
    platform.state.nextPick = await exportedFile();
    const onOpenProviders = jest.fn();
    await open('en', { onOpenProviders });
    await press('Choose a file');
    await press('Replace my data');
    fireEvent.press(await screen.findByRole('button', { name: 'Open AI providers' }));
    expect(onOpenProviders).toHaveBeenCalled();
  });

  it('cancelling at the confirmation changes nothing', async () => {
    await onboard();
    await seedHere();
    const before = dumpAll(h);
    platform.state.nextPick = await exportedFile();
    await open();
    await press('Choose a file');
    await press('Keep my data');
    await waitFor(() => expect(screen.queryByText('Replace your data?')).not.toBeOnTheScreen());
    expect(dumpAll(h)).toEqual(before);
    expect(platform.state.cache.size).toBe(0);
  });

  it('closing the file picker without choosing does nothing, and says nothing', async () => {
    await onboard();
    platform.state.nextPick = null;
    await open();
    await press('Choose a file');
    expect(screen.queryByText('Replace your data?')).not.toBeOnTheScreen();
    expect(screen.queryByText('This file cannot be imported')).not.toBeOnTheScreen();
  });

  it.each([
    ['a file that is not an export', () => strToU8('just some text'), /This is not a Qbit Nutrition export file/],
    ['a truncated file', (good: Uint8Array) => good.slice(0, Math.floor(good.length / 2)), /incomplete or damaged/],
  ])('refuses %s with a specific message and keeps the data', async (_name, make, message) => {
    await onboard();
    await seedHere();
    const before = dumpAll(h);
    const good = (await exportedFile()).bytes;
    platform.state.nextPick = { name: 'x.json', bytes: make(good) };
    await open();
    await press('Choose a file');
    expect(await screen.findByText('This file cannot be imported')).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.getByText('Your current data was not changed.')).toBeOnTheScreen();
    expect(dumpAll(h)).toEqual(before);
  });

  it('names the place of a wrong type inside a meal', async () => {
    await onboard();
    const good = JSON.parse(new TextDecoder().decode((await exportedFile()).bytes));
    good.meals[0].items[0].grams = 'lots';
    platform.state.nextPick = { name: 'x.json', bytes: strToU8(JSON.stringify(good)) };
    await open();
    await press('Choose a file');
    expect(await screen.findByText('The file has something this app cannot read, at meals[0].items[0].grams.')).toBeOnTheScreen();
  });

  it('says that a newer format needs a newer app', async () => {
    await onboard();
    const good = JSON.parse(new TextDecoder().decode((await exportedFile()).bytes));
    good.format_version = 2;
    platform.state.nextPick = { name: 'x.json', bytes: strToU8(JSON.stringify(good)) };
    await open();
    await press('Choose a file');
    expect(await screen.findByText(/made by a newer version of Qbit Nutrition \(file format 2; this app reads format 1 and older\)/)).toBeOnTheScreen();
  });

  it('after a refusal another file can be chosen', async () => {
    await onboard();
    platform.state.nextPick = { name: 'x.txt', bytes: strToU8('nope') };
    await open();
    await press('Choose a file');
    await screen.findByText('This file cannot be imported');
    platform.state.nextPick = await exportedFile();
    await press('Choose another file');
    expect(await screen.findByText('Replace your data?')).toBeOnTheScreen();
  });

  it('switches to the language of the imported data', async () => {
    await onboard();
    platform.state.nextPick = await exportedFile({ language: 'es' });
    await open();
    await press('Choose a file');
    await press('Replace my data');
    await waitFor(() => expect(i18n.language).toBe('es'));
  });
});

describe('Settings → Data: delete all (S3)', () => {
  it('asks for a typed word, and nothing is deleted until it is typed', async () => {
    await onboard();
    await seedHere();
    platform.addPhoto('photos/a.jpg', jpeg(1));
    const before = dumpAll(h);
    await open();
    await press('Delete all data');
    expect(await screen.findByText('Delete everything?')).toBeOnTheScreen();
    expect(screen.getByText('The button turns on when you type DELETE.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('confirm-word'), 'DELET');
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete everything' }));
    expect(dumpAll(h)).toEqual(before);
    expect(platform.state.photos.size).toBe(1);
  });

  it('cancelling changes nothing', async () => {
    await onboard();
    await seedHere();
    const before = dumpAll(h);
    await open();
    await press('Delete all data');
    await fireEvent.changeText(screen.getByTestId('confirm-word'), 'DELETE');
    await press('Keep my data');
    await waitFor(() => expect(screen.queryByText('Delete everything?')).not.toBeOnTheScreen());
    expect(dumpAll(h)).toEqual(before);
    expect(screen.getByTestId('probe').props.children).toBe('onboarded');
  });

  it('deletes everything and returns the app to first launch', async () => {
    await onboard();
    const seeded = await seedHere();
    platform.addPhoto('photos/a.jpg', jpeg(1));
    await services.secrets.set(seeded.providerIds[0]!, 'a-key');
    await open();
    expect(await screen.findByRole('button', { name: 'Export data' })).toBeOnTheScreen();
    expect(screen.getByTestId('probe').props.children).toBe('onboarded');

    await press('Delete all data');
    await fireEvent.changeText(screen.getByTestId('confirm-word'), 'delete'); // not case-sensitive
    await press('Delete everything');

    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('first launch'));
    expect(await h.repos.profile.get()).toBeNull();
    expect(await h.repos.settings.getAll()).toEqual({});
    expect(platform.state.photos.size).toBe(0);
    expect(await services.secrets.has(seeded.providerIds[0]!)).toBe(false);
  });

  it('when something cannot be deleted it says so, keeps the data, and the person can try again', async () => {
    await onboard();
    await seedHere();
    platform.addPhoto('photos/a.jpg', jpeg(1));
    platform.state.failPhotoRemove.add('photos/a.jpg');
    await open();
    await press('Delete all data');
    await fireEvent.changeText(screen.getByTestId('confirm-word'), 'DELETE');
    await press('Delete everything');
    expect(await screen.findByText(/Removed: your AI provider keys and 0 of 1 meal photo.*Not removed: 1 meal photo and all your data\. Trying again is safe/)).toBeOnTheScreen();
    expect(await h.repos.profile.get()).not.toBeNull();
    expect(screen.getByTestId('probe').props.children).toBe('onboarded');

    platform.state.failPhotoRemove.clear();
    await press('Delete everything');
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('first launch'));
  });
});

describe('Settings → Data in Spanish', () => {
  it('uses the Spanish confirmation word', async () => {
    await onboard();
    await open('es');
    expect(await screen.findByRole('button', { name: 'Exportar datos' })).toBeOnTheScreen();
    await press('Borrar todos los datos');
    expect(await screen.findByText('Escribe BORRAR para confirmar.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('confirm-word'), 'BORRAR');
    expect(screen.getByRole('button', { name: 'Borrar todo' })).toBeEnabled();
  });
});
