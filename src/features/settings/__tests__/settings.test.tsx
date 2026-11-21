import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { proposeTargets, TARGET_SOURCES } from '@/core/nutrition';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { CalculationScreen } from '../../goals/CalculationScreen';
import { GoalSettingsScreen } from '../../goals/GoalSettingsScreen';
import { MinimumEnergyScreen } from '../../goals/MinimumEnergyScreen';
import { AppSession, useSession } from '../../session/AppSession';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { AboutScreen } from '../AboutScreen';
import { ProfileSettingsScreen } from '../ProfileSettingsScreen';
import { SettingsScreen } from '../SettingsScreen';

const NOW = new Date(2026, 10, 21, 10, 0);
const clock = () => new Date(NOW);
const TODAY = '2026-11-21';

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

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const choose = (name: string) => fireEvent.press(screen.getByRole('radio', { name }));
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

const seedProfile = (over: Partial<Parameters<typeof h.repos.profile.save>[0]> = {}) =>
  h.repos.profile.save({
    sex: 'female',
    birthDate: '1990-01-01',
    heightCm: 150,
    activityLevel: 'sedentary',
    unitSystem: 'metric',
    locale: 'en',
    disclaimerAcceptedAt: '2026-11-01T10:00:00.000Z',
    disclaimerVersion: '2026-11-21',
    ...over,
  });

describe('language', () => {
  function Probe() {
    const { t } = useTranslation();
    const session = useSession();
    return (
      <Text>
        {t('common.back')} {session.onboarded ? 'onboarded' : 'not onboarded'}
      </Text>
    );
  }

  it('survives a restart', async () => {
    await renderApp(<SettingsScreen onOpen={jest.fn()} />, { services, locale: 'en' });
    await choose('Español');
    expect(await h.repos.settings.get('locale')).toBe('es');
    expect(await screen.findByRole('header', { name: 'Idioma' })).toBeOnTheScreen();

    // "Restart": a new tree over the same database, starting from the device language.
    await cleanup();
    await renderApp(
      <AppSession>
        <Probe />
      </AppSession>,
      { services, locale: 'en' },
    );
    expect(await screen.findByText(/Atrás/)).toBeOnTheScreen();
    expect(i18n.language).toBe('es');
  });

  it('also updates the language stored with the profile', async () => {
    await seedProfile();
    await renderApp(<SettingsScreen onOpen={jest.fn()} />, { services, locale: 'en' });
    await choose('Español');
    await screen.findByRole('header', { name: 'Idioma' });
    expect((await h.repos.profile.get())?.locale).toBe('es');
  });

  it('knows whether onboarding was completed', async () => {
    await renderApp(
      <AppSession>
        <Probe />
      </AppSession>,
      { services },
    );
    expect(await screen.findByText(/not onboarded/)).toBeOnTheScreen();

    await cleanup();
    await h.repos.settings.set('onboarding_completed_at', NOW.toISOString());
    await renderApp(
      <AppSession>
        <Probe />
      </AppSession>,
      { services },
    );
    expect(await screen.findByText(/^Back onboarded$/)).toBeOnTheScreen();
  });
});

describe('settings menu', () => {
  it('opens each section', async () => {
    const onOpen = jest.fn();
    await renderApp(<SettingsScreen onOpen={onOpen} />, { services });
    await press('Profile and units');
    await press('Goal and targets');
    await press('Minimum daily energy');
    await press('Data');
    await press('About and health notice');
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(['profile', 'goal', 'minimum', 'data', 'about']);
  });
});

describe('minimum daily energy (S3)', () => {
  const GOAL = { type: 'lose_fat', pace: 'moderate' } as const;
  const PROFILE = { sex: 'female', birthDate: '1990-01-01', heightCm: 150, weightKg: 45, activityLevel: 'sedentary' } as const;

  async function seedBelowMinimum() {
    await seedProfile();
    await h.repos.measurements.record({ measuredOn: '2026-11-20', kind: 'weight', value: 45 });
  }

  it('shows the default with its source, and changes the outcome when adjusted', async () => {
    await seedBelowMinimum();
    expect(proposeTargets(PROFILE, GOAL, { referenceDate: TODAY })).toMatchObject({ reason: 'below_minimum' });
    const lowered = proposeTargets(PROFILE, GOAL, { referenceDate: TODAY, minimumDailyKcal: 1000 });
    if (lowered.kind !== 'proposal') throw new Error('expected a proposal');

    // Before: the goal is refused.
    await renderApp(<GoalSettingsScreen now={clock} />, { services });
    await press('Set up targets');
    await choose('Lose fat');
    await choose('Moderate');
    await press('Continue');
    expect(await screen.findByRole('header', { name: 'This goal is below the minimum' })).toBeOnTheScreen();
    await cleanup();

    // The setting shows the default and where it comes from, and can be changed.
    await renderApp(<MinimumEnergyScreen />, { services });
    expect(await screen.findByText('Default: 1,200 kcal for women, 1,500 kcal for men.')).toBeOnTheScreen();
    expect(screen.getByText(/Dietary Guidelines for Americans 2015-2020/)).toBeOnTheScreen();
    await type('Minimum daily energy (kcal)', '1000');
    await press('Save minimum');
    expect(await screen.findByText('Minimum saved')).toBeOnTheScreen();
    expect(await h.repos.settings.get('minimum_daily_kcal')).toBe('1000');
    await cleanup();

    // After: the same goal now gets the numbers proposeTargets returns for that minimum.
    await renderApp(<GoalSettingsScreen now={clock} />, { services });
    await press('Set up targets');
    await choose('Lose fat');
    await choose('Moderate');
    await press('Continue');
    expect(await screen.findByLabelText('Calories (kcal)')).toHaveDisplayValue(String(lowered.kcal));
  });

  it('rejects a value outside its range and can return to the default', async () => {
    await h.repos.settings.set('minimum_daily_kcal', '1000');
    await renderApp(<MinimumEnergyScreen />, { services });
    expect(await screen.findByLabelText('Minimum daily energy (kcal)')).toHaveDisplayValue('1000');

    await type('Minimum daily energy (kcal)', '90');
    await press('Save minimum');
    expect(screen.getByText('Enter a whole number from 500 to 4,000.')).toBeOnTheScreen();
    expect(await h.repos.settings.get('minimum_daily_kcal')).toBe('1000');

    await press('Use the default');
    expect(await screen.findByText('Default minimum restored')).toBeOnTheScreen();
    expect(await h.repos.settings.get('minimum_daily_kcal')).toBeNull();
  });
});

describe('goal and targets (FR-13)', () => {
  it('starts a new goal period from today and keeps earlier days on their targets', async () => {
    await seedProfile({ sex: 'male', birthDate: '1990-05-14', heightCm: 175, activityLevel: 'moderate' });
    await h.repos.measurements.record({ measuredOn: '2026-11-20', kind: 'weight', value: 70 });
    await h.repos.goals.set({ type: 'maintain', startDate: '2026-10-01', kcalTarget: 2100, proteinGTarget: 150, carbsGTarget: 220, fatGTarget: 70 });

    await renderApp(<GoalSettingsScreen now={clock} />, { services });
    expect(await screen.findByText('Since Oct 1, 2026')).toBeOnTheScreen();
    await press('Change goal or targets');
    await choose('Maintain weight');
    await press('Continue');
    await type('Calories (kcal)', '2000');
    await press('Save targets');
    expect(await screen.findByText('Targets saved')).toBeOnTheScreen();

    const history = await h.repos.goals.history();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ startDate: '2026-10-01', endDate: '2026-11-20', kcalTarget: 2100 });
    expect(history[1]).toMatchObject({ startDate: TODAY, endDate: null, kcalTarget: 2000, isCustom: true });
    expect((await h.repos.goals.on('2026-11-15'))?.kcalTarget).toBe(2100);
  });
});

describe('profile and units', () => {
  it('stores imperial input as metric and shows it back in the chosen units', async () => {
    await seedProfile();
    await renderApp(<ProfileSettingsScreen now={clock} />, { services });
    await choose('Imperial (lb, ft, in)');
    await type('Height (ft)', '5');
    await type('Height (in)', '9');
    await type('Weight (lb)', '154');
    await press('Save profile');
    expect(await screen.findByText('Profile saved')).toBeOnTheScreen();

    const profile = await h.repos.profile.get();
    expect(profile?.unitSystem).toBe('imperial');
    expect(profile?.heightCm).toBeCloseTo(175.3, 1);
    expect((await h.repos.measurements.latest('weight'))?.value).toBeCloseTo(69.9, 1);

    await cleanup();
    await renderApp(<ProfileSettingsScreen now={clock} />, { services });
    expect(await screen.findByLabelText('Height (ft)')).toHaveDisplayValue('5');
    expect(screen.getByLabelText('Height (in)')).toHaveDisplayValue('9');
    expect(screen.getByLabelText('Weight (lb)')).toHaveDisplayValue('154');
  });

  it('keeps the disclaimer acceptance when the profile is edited', async () => {
    await seedProfile();
    await renderApp(<ProfileSettingsScreen now={clock} />, { services });
    await choose('Male');
    await press('Save profile');
    await screen.findByText('Profile saved');
    expect(await h.repos.profile.get()).toMatchObject({ sex: 'male', disclaimerVersion: '2026-11-21', disclaimerAcceptedAt: '2026-11-01T10:00:00.000Z' });
  });
});

describe('how this is calculated', () => {
  it('renders every constant with its source, and flags the one without', async () => {
    await renderApp(<CalculationScreen />, { services });
    await screen.findByRole('header', { name: 'How this is calculated' });

    const entries = Object.values(TARGET_SOURCES);
    for (const status of ['sourced', 'sourced_range', 'unsourced'] as const) {
      const expected = entries.filter((e) => e.status === status).length;
      const label = { sourced: 'Published value', sourced_range: 'A point chosen inside a published range', unsourced: 'No published source found: our own conservative choice' }[status];
      expect(screen.getAllByText(label)).toHaveLength(expected);
    }
    expect(screen.getAllByText('Open source')).toHaveLength(entries.filter((e) => e.source).length);
    expect(screen.getByText('Fat loss, gentle pace')).toBeOnTheScreen();
    expect(screen.getByText(/A new predictive equation for resting energy expenditure/)).toBeOnTheScreen();
  });
});

describe('about', () => {
  it('shows the disclaimer and when it was accepted', async () => {
    await seedProfile();
    await renderApp(<AboutScreen />, { services });
    expect(await screen.findByText('This app is not medical advice')).toBeOnTheScreen();
    expect(screen.getByText(/Accepted on .*2026-11-21\)/)).toBeOnTheScreen();
  });
});
