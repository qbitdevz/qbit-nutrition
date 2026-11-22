import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { createFakeDataPlatform } from '@/platform/fakeDataPlatform';
import { createFakeHealthPlatform, type FakeHealthPlatform } from '@/platform/fakeHealthPlatform';
import { DataPlatformProvider } from '../../data/DataPlatformContext';
import { DataScreen } from '../../data/DataScreen';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { SettingsScreen } from '../../settings/SettingsScreen';
import { createHealthSync } from '../healthSync';
import { IntegrationsScreen } from '../IntegrationsScreen';
import { withHealthSync } from '../syncedRepos';

let h: Harness;
let platform: FakeHealthPlatform;
let services: ReturnType<typeof createTestServices>;

beforeEach(async () => {
  h = await createHarness();
  platform = createFakeHealthPlatform();
  const base = createTestServices(h);
  const health = createHealthSync({ repos: h.repos, platform, now: () => new Date('2026-06-15T12:00:00.000Z') });
  services = { ...base, repos: withHealthSync(h.repos, health), health };
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

const press = async (target: string | RegExp | TestInstance) =>
  fireEvent.press(typeof target === 'string' || target instanceof RegExp ? screen.getByRole('button', { name: target }) : target);
const open = (locale: 'en' | 'es' = 'en', props: Partial<Parameters<typeof IntegrationsScreen>[0]> = {}) => renderApp(<IntegrationsScreen {...props} />, { services, locale });

const lunch = () =>
  services.repos.meals.save({
    eatenAt: new Date('2026-06-15T10:30:00.000Z'),
    slot: 'lunch',
    source: 'manual',
    items: [{ displayName: 'Rice', grams: 100, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } }],
  });

describe('Integrations (S7, S9)', () => {
  it('starts off, says so in words, and has called nothing on the platform', async () => {
    await open();
    expect(await screen.findByText('Off. Nothing is shared with Health Connect.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Turn on Health Connect' })).toBeOnTheScreen();
    expect(platform.state.calls).toEqual([]);
  });

  it('shows the rationale first: each data type and why, with the permission screen not yet asked for', async () => {
    await open();
    await press(await screen.findByRole('button', { name: 'Turn on Health Connect' }));

    expect(await screen.findByRole('header', { name: 'What Qbit Nutrition uses Health Connect for' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Nutrition' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Weight' })).toBeOnTheScreen();
    expect(screen.getByText(/Each meal you save becomes a nutrition record/)).toBeOnTheScreen();
    expect(screen.getByText(/copied into this app so they appear in your weight chart/)).toBeOnTheScreen();
    expect(screen.getByText(/allow one of the two and decline the other/)).toBeOnTheScreen();
    expect(platform.state.calls).toEqual([]);
    expect(await h.repos.settings.get('health_connect.enabled')).toBeNull();

    // "Not now" goes back without turning anything on.
    await press('Not now');
    expect(await screen.findByText('Off. Nothing is shared with Health Connect.')).toBeOnTheScreen();
    expect(platform.state.calls).toEqual([]);
  });

  it('turns on after the rationale and shows each grant in words', async () => {
    await open();
    await press(await screen.findByRole('button', { name: 'Turn on Health Connect' }));
    await press(await screen.findByRole('button', { name: 'Continue to permissions' }));

    expect(await screen.findByText('On.')).toBeOnTheScreen();
    expect(screen.getByTestId('grant-writeNutrition')).toHaveTextContent(/Allowed/);
    expect(screen.getByTestId('grant-readWeight')).toHaveTextContent(/Allowed/);
    expect(screen.getByTestId('health-pending')).toHaveTextContent('Every saved meal is up to date in Health Connect.');
  });

  it('lets one grant be declined: that one reads "Not allowed" with its own Allow button, and the other still works', async () => {
    platform.state.willGrant = { writeNutrition: true, readWeight: false };
    await open();
    await press(await screen.findByRole('button', { name: 'Turn on Health Connect' }));
    await press(await screen.findByRole('button', { name: 'Continue to permissions' }));

    await screen.findByText('On.');
    expect(screen.getByTestId('grant-readWeight')).toHaveTextContent(/Not allowed/);
    expect(screen.getByTestId('grant-writeNutrition')).toHaveTextContent(/Allowed/);
    await lunch();
    await services.health.idle();
    expect(platform.state.records.size).toBe(1);

    platform.state.willGrant.readWeight = true;
    await press('Allow: Read my weight from Health Connect');
    await waitFor(() => expect(screen.getByTestId('grant-readWeight')).toHaveTextContent(/Allowed/));
  });

  it('says when no access was given and stays off', async () => {
    platform.state.willGrant = { writeNutrition: false, readWeight: false };
    await open();
    await press(await screen.findByRole('button', { name: 'Turn on Health Connect' }));
    await press(await screen.findByRole('button', { name: 'Continue to permissions' }));
    expect(await screen.findByText(/No access was granted, so Health Connect stays off/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Turn on Health Connect' })).toBeOnTheScreen();
  });

  it.each([
    ['not_installed', /not installed on this phone/, 'Get Health Connect'],
    ['needs_update', /needs an update/, 'Update Health Connect'],
    ['unavailable', /cannot be used on this phone/, null],
  ] as const)('explains %s and offers the way forward', async (availability, message, action) => {
    platform.state.availability = availability;
    await open();
    await press(await screen.findByRole('button', { name: 'Turn on Health Connect' }));
    await press(await screen.findByRole('button', { name: 'Continue to permissions' }));
    expect(await screen.findByText(message)).toBeOnTheScreen();
    if (action) {
      await press(action);
      expect(platform.state.installOpened).toBe(1);
    } else {
      expect(screen.queryByRole('button', { name: /Get Health Connect|Update Health Connect/ })).toBeNull();
    }
    expect(await services.health.isEnabled()).toBe(false);
  });

  it('shows a revoked permission and the meals waiting because of it, then recovers when it is allowed again', async () => {
    await services.health.turnOn();
    platform.state.granted.writeNutrition = false;
    await lunch();
    await services.health.idle();

    await open();
    await waitFor(() => expect(screen.getByTestId('grant-writeNutrition')).toHaveTextContent(/Access was taken away in Health Connect/));
    expect(screen.getByTestId('health-pending')).toHaveTextContent('1 meal is waiting to be written to Health Connect.');
    expect(screen.getByText(/The last attempt did not work/)).toBeOnTheScreen();

    await press('Allow: Save my meals to Health Connect');
    await waitFor(() => expect(screen.getByTestId('health-pending')).toHaveTextContent(/Every saved meal is up to date/));
    expect(platform.state.records.size).toBe(1);
  });

  it('shows a failed write as pending and writes it when the person presses "Try again now"', async () => {
    await services.health.turnOn();
    platform.state.failWrites = 1;
    await lunch();
    await services.health.idle();

    await open();
    await waitFor(() => expect(screen.getByTestId('health-pending')).toHaveTextContent(/1 meal is waiting/));
    await press('Try again now');
    await waitFor(() => expect(screen.getByTestId('health-pending')).toHaveTextContent(/Every saved meal is up to date/));
    expect(platform.state.records.size).toBe(1);
  });

  it('sends the existing meals only when asked, and says how many were queued', async () => {
    await h.repos.meals.save({
      eatenAt: new Date('2026-06-14T10:30:00.000Z'),
      slot: 'lunch',
      source: 'manual',
      items: [{ displayName: 'Old', grams: 100, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 100, protein: 1, carbs: 1, fat: 1 } }],
    });
    await services.health.turnOn();
    expect(platform.state.records.size).toBe(0);
    await open();
    await press(await screen.findByRole('button', { name: 'Send my existing meals' }));
    expect(await screen.findByText('1 meal was queued to be saved to Health Connect.')).toBeOnTheScreen();
    expect(platform.state.records.size).toBe(1);
  });

  it('turns off, and the screen goes back to saying nothing is shared', async () => {
    await services.health.turnOn();
    await open();
    await press(await screen.findByRole('button', { name: 'Turn off' }));
    expect(await screen.findByText('Off. Nothing is shared with Health Connect.')).toBeOnTheScreen();
    expect(await services.health.isEnabled()).toBe(false);
  });

  it('opens Health Connect to manage access', async () => {
    await services.health.turnOn();
    await open();
    await press(await screen.findByRole('button', { name: 'Manage access in Health Connect' }));
    expect(platform.state.settingsOpened).toBe(1);
  });

  it('reads in Spanish: the rationale, the states, and the buttons', async () => {
    await open('es');
    await press(await screen.findByRole('button', { name: 'Activar Health Connect' }));
    expect(await screen.findByRole('header', { name: 'Para qué usa Qbit Nutrition Health Connect' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Nutrición' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Peso' })).toBeOnTheScreen();
    await press('Continuar a los permisos');
    expect(await screen.findByText('Activado.')).toBeOnTheScreen();
    expect(screen.getByTestId('grant-writeNutrition')).toHaveTextContent(/Permitido/);
  });

  it('links the rationale to the privacy policy when the screen can open it', async () => {
    const onOpenPrivacy = jest.fn();
    await open('en', { onOpenPrivacy });
    await press(await screen.findByRole('button', { name: 'Turn on Health Connect' }));
    await press(await screen.findByRole('button', { name: 'Read the privacy policy' }));
    expect(onOpenPrivacy).toHaveBeenCalled();
  });
});

describe('Settings and Data', () => {
  it('Settings lists Integrations with its state', async () => {
    const view = await renderApp(<SettingsScreen onOpen={jest.fn()} />, { services });
    expect(await screen.findByRole('button', { name: 'Integrations' })).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Integrations' }).props.accessibilityHint).toBe('Health Connect · Off'));
    await view.unmount();
    await services.health.turnOn();
    await renderApp(<SettingsScreen onOpen={jest.fn()} />, { services });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Integrations' }).props.accessibilityHint).toBe('Health Connect · On'));
  });

  async function openDelete() {
    await renderApp(
      <DataPlatformProvider platform={createFakeDataPlatform()}>
        <DataScreen />
      </DataPlatformProvider>,
      { services },
    );
    await press(await screen.findByRole('button', { name: 'Delete all data' }));
    await fireEvent.changeText(await screen.findByTestId('confirm-word'), 'DELETE');
  }

  it('Delete all offers to remove the records this app wrote, and removes them with the data', async () => {
    await services.health.turnOn();
    await lunch();
    await services.health.idle();
    expect(platform.state.records.size).toBe(1);

    await openDelete();
    expect(await screen.findByTestId('delete-health')).toBeOnTheScreen();
    await press('Delete everything');
    await waitFor(() => expect(platform.state.records.size).toBe(0));
    await waitFor(() => expect(h.repos.meals.listIds()).resolves.toEqual([]));
  });

  it('Delete all keeps the records in Health Connect when the person chooses to', async () => {
    await services.health.turnOn();
    await lunch();
    await services.health.idle();
    await openDelete();
    await press(await screen.findByRole('radio', { name: 'Keep them in Health Connect' }));
   
    await press('Delete everything');
    await waitFor(() => expect(h.repos.meals.listIds()).resolves.toEqual([]));
    expect(platform.state.records.size).toBe(1);
  });

  it('deletes nothing when Health Connect refuses to remove its records, and says so', async () => {
    await services.health.turnOn();
    await lunch();
    await services.health.idle();
    platform.state.failDeletes = 1;
    await openDelete();
    await press('Delete everything');
    expect(await screen.findByText(/could not be removed, so nothing was deleted/)).toBeOnTheScreen();
    expect(await h.repos.meals.listIds()).toHaveLength(1);
  });

  it('does not mention Health Connect in Delete all while the integration is off', async () => {
    await openDelete();
    expect(screen.queryByTestId('delete-health')).toBeNull();
  });
});
