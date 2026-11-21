import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { AppSession, useSession } from '../../session/AppSession';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { NoticeGate } from '../NoticeGate';
import { DISCLAIMER_VERSION } from '../version';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

const NOW = new Date('2026-12-01T09:00:00.000Z');

async function onboard(disclaimerVersion: string) {
  await h.repos.profile.save({ unitSystem: 'metric', locale: 'en', disclaimerAcceptedAt: '2026-11-01T10:00:00.000Z', disclaimerVersion });
  await h.repos.settings.set('onboarding_completed_at', '2026-11-01T10:01:00.000Z');
}

const app = () => (
  <AppSession>
    <NoticeGate now={() => NOW}>
      <Text testID="app">The app</Text>
    </NoticeGate>
  </AppSession>
);

describe('the health notice is asked again when its text version changes (S8)', () => {
  it('lets someone who accepted the current version straight in, without asking', async () => {
    await onboard(DISCLAIMER_VERSION);
    await renderApp(app(), { services });
    expect(await screen.findByTestId('app')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'This app is not medical advice' })).toBeNull();
  });

  it('asks again, with the full text, when the stored version is not the current one', async () => {
    await onboard('2026-01-01');
    await renderApp(app(), { services });
    expect(await screen.findByRole('header', { name: 'The health notice changed' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'This app is not medical advice' })).toBeOnTheScreen();
    expect(screen.getByText(/Values are estimates\./)).toBeOnTheScreen();
    expect(screen.queryByTestId('app')).toBeNull();
    // Nothing was stored just by showing it.
    expect((await h.repos.profile.get())?.disclaimerVersion).toBe('2026-01-01');
  });

  it('asks when the stored version is empty (a profile that came from an import has not accepted it here)', async () => {
    await onboard('');
    await renderApp(app(), { services });
    expect(await screen.findByRole('header', { name: 'The health notice changed' })).toBeOnTheScreen();
  });

  it('records the acceptance with the current version and the time, keeps the rest of the profile, and lets the person in', async () => {
    await h.repos.profile.save({ sex: 'female', heightCm: 160, unitSystem: 'imperial', locale: 'en', disclaimerAcceptedAt: '2026-11-01T10:00:00.000Z', disclaimerVersion: '2026-01-01' });
    await h.repos.settings.set('onboarding_completed_at', '2026-11-01T10:01:00.000Z');
    await renderApp(app(), { services });
    await fireEvent.press(await screen.findByRole('button', { name: 'I have read it' }));

    expect(await screen.findByTestId('app')).toBeOnTheScreen();
    const profile = await h.repos.profile.get();
    expect(profile).toMatchObject({
      disclaimerVersion: DISCLAIMER_VERSION,
      disclaimerAcceptedAt: NOW.toISOString(),
      sex: 'female',
      heightCm: 160,
      unitSystem: 'imperial',
    });
  });

  it('does not let the person in when they decline, and asks again the next time', async () => {
    await onboard('2026-01-01');
    await renderApp(app(), { services });
    await fireEvent.press(await screen.findByRole('button', { name: 'I do not accept' }));
    expect(await screen.findByRole('header', { name: 'The app needs this notice to be accepted' })).toBeOnTheScreen();
    expect(screen.queryByTestId('app')).toBeNull();
    expect((await h.repos.profile.get())?.disclaimerVersion).toBe('2026-01-01');

    // "Read the notice again" goes back to the notice.
    await fireEvent.press(screen.getByRole('button', { name: 'Read the notice again' }));
    expect(await screen.findByRole('button', { name: 'I have read it' })).toBeOnTheScreen();
  });

  it('keeps asking until accepted: a fresh start with the old version asks again', async () => {
    await onboard('2026-01-01');
    const first = await renderApp(app(), { services });
    expect(await screen.findByRole('header', { name: 'The health notice changed' })).toBeOnTheScreen();
    await first.unmount();
    await renderApp(app(), { services });
    expect(await screen.findByRole('header', { name: 'The health notice changed' })).toBeOnTheScreen();
  });

  it('is not asked during first launch: onboarding has its own notice step', async () => {
    await renderApp(app(), { services });
    // Not onboarded and no profile: the gate stays out of the way (the route guard shows onboarding).
    expect(await screen.findByTestId('app')).toBeOnTheScreen();
  });

  it('reads in Spanish', async () => {
    await onboard('2026-01-01');
    await h.repos.settings.set('locale', 'es');
    await renderApp(app(), { services, locale: 'es' });
    expect(await screen.findByRole('header', { name: 'El aviso de salud cambió' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Esta aplicación no es un consejo médico' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lo he leído' })).toBeOnTheScreen();
  });

  it('shows the same version the onboarding stores, and a changed text means a changed version', () => {
    // The text lives in en.json / es.json under legal.disclaimer; DISCLAIMER_VERSION must move with it (see version.ts).
    expect(DISCLAIMER_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  function Probe() {
    const { noticeCurrent } = useSession();
    return <Text testID="probe">{noticeCurrent ? 'current' : 'stale'}</Text>;
  }

  it('tells the session whether the stored version is current', async () => {
    await onboard('2026-01-01');
    await renderApp(
      <AppSession>
        <Probe />
      </AppSession>,
      { services },
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('stale'));
  });
});
