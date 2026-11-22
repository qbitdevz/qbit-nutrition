import { cleanup, fireEvent, screen } from '@testing-library/react-native';

import { proposeTargets } from '@/core/nutrition';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { DISCLAIMER_VERSION } from '../../legal/version';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { OnboardingFlow } from '../OnboardingFlow';

// 21 Nov 2026, 10:00 local.
const NOW = new Date(2026, 10, 21, 10, 0);
const clock = () => new Date(NOW);
const TODAY = '2026-11-21';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
const onDone = jest.fn();

beforeEach(async () => {
  h = await createHarness();
  services = createTestServices(h);
  onDone.mockReset();
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  jest.restoreAllMocks();
});

const header = (name: string) => screen.findByRole('header', { name });
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const choose = (name: string) => fireEvent.press(screen.getByRole('radio', { name }));
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

async function start(locale: 'en' | 'es' = 'en') {
  await renderApp(<OnboardingFlow now={clock} onDone={onDone} />, { services, locale });
  await header(locale === 'en' ? 'Choose your language' : 'Elige tu idioma');
}

async function acceptDisclaimer() {
  await press('Continue');
  await header('This app is not medical advice');
  await press('I understand and accept');
  await header('About you');
}

interface Profile {
  sex?: 'Female' | 'Male';
  day?: string;
  month?: string;
  year?: string;
  cm?: string;
  kg?: string;
  activity?: string;
  condition?: string;
}

async function fillProfile(p: Profile) {
  if (p.sex) await choose(p.sex);
  if (p.day) await type('Day', p.day);
  if (p.month) await type('Month', p.month);
  if (p.year) await type('Year', p.year);
  if (p.cm) await type('Height (cm)', p.cm);
  if (p.kg) await type('Weight (kg)', p.kg);
  if (p.activity) await choose(p.activity);
  if (p.condition) await choose(p.condition);
}

async function chooseGoal(goal: string, pace?: string) {
  // After Skip the goal step is already on its way; otherwise it follows Continue on the profile.
  if (!screen.queryByRole('button', { name: 'Skip' })) await header('What is your goal?');
  else await press('Continue');
  await header('What is your goal?');
  await choose(goal);
  if (pace) await choose(pace);
  await press('Continue');
}

const MAN = { sex: 'Male', day: '14', month: '5', year: '1990', cm: '175', kg: '70', activity: 'Moderately active' } as const;
const MAN_CORE = { sex: 'male', birthDate: '1990-05-14', heightCm: 175, weightKg: 70, activityLevel: 'moderate' } as const;

describe('onboarding: the health notice', () => {
  it('cannot be passed without accepting the disclaimer', async () => {
    await start();
    await press('Continue');
    await header('This app is not medical advice');

    // There is no way forward from the notice except accepting it.
    expect(screen.queryByRole('header', { name: 'About you' })).toBeNull();
    await press('I do not accept');
    await header('You need to accept to continue');
    expect(screen.queryByRole('header', { name: 'About you' })).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    expect(await h.repos.profile.get()).toBeNull();

    // Reading it again and accepting is the only way in.
    await press('Read it again');
    await header('This app is not medical advice');
    await press('I understand and accept');
    await header('About you');
  });

  it('shows the text of docs/12 section 2 verbatim, in English and in Spanish', async () => {
    await start();
    await press('Continue');
    await header('This app is not medical advice');
    expect(screen.getByText('Qbit Nutrition is a tool for keeping a personal food log. It is not a medical device and does not diagnose, treat, or prevent any condition.')).toBeOnTheScreen();
    expect(screen.getByText('If tracking food causes you distress, stop using the app and seek support from a health professional.')).toBeOnTheScreen();
    expect(screen.getByText(/Never use it to decide whether a food is safe for you\./)).toBeOnTheScreen();

    await cleanup();
    await start('es');
    await press('Continuar');
    await header('Esta aplicación no es un consejo médico');
    expect(screen.getByText(/Nunca la uses para decidir si un alimento es seguro para ti\./)).toBeOnTheScreen();
    expect(screen.getByText('Si registrar tus comidas te genera malestar, deja de usar la aplicación y busca apoyo de un profesional de la salud.')).toBeOnTheScreen();
  });

  it('stores the accepted version and time with the profile', async () => {
    await start();
    await acceptDisclaimer();
    await press('Skip');
    await chooseGoal('Maintain weight');
    await press('Continue without targets');
    expect(onDone).toHaveBeenCalledTimes(1);

    const profile = await h.repos.profile.get();
    expect(profile?.disclaimerVersion).toBe(DISCLAIMER_VERSION);
    expect(profile?.disclaimerAcceptedAt).toBe(NOW.toISOString());
  });
});

describe('onboarding: language', () => {
  it('preselects the device language and applies the choice at once', async () => {
    await start('es');
    expect(screen.getByRole('radio', { name: 'Español' })).toBeChecked();

    await choose('English');
    await header('Choose your language');
    expect(i18n.language).toBe('en');
    expect(await h.repos.settings.get('locale')).toBe('en');
  });
});

describe('onboarding: targets from the profile', () => {
  it('produces exactly the numbers proposeTargets returns, and saves them as a goal', async () => {
    const expected = proposeTargets(MAN_CORE, { type: 'lose_fat', pace: 'moderate' }, { referenceDate: TODAY });
    expect(expected.kind).toBe('proposal');
    if (expected.kind !== 'proposal') return;

    await start();
    await acceptDisclaimer();
    await fillProfile(MAN);
    await chooseGoal('Lose fat', 'Moderate');
    await header('Your daily targets');

    expect(screen.getByLabelText('Calories (kcal)')).toHaveDisplayValue(String(expected.kcal));
    expect(screen.getByLabelText('Protein (g)')).toHaveDisplayValue(String(expected.proteinG));
    expect(screen.getByLabelText('Carbs (g)')).toHaveDisplayValue(String(expected.carbsG));
    expect(screen.getByLabelText('Fat (g)')).toHaveDisplayValue(String(expected.fatG));
    expect(screen.getByRole('button', { name: 'How this is calculated' })).toBeOnTheScreen();

    await press('Save and continue');
    expect(onDone).toHaveBeenCalledTimes(1);

    const goal = await h.repos.goals.current();
    expect(goal).toMatchObject({
      type: 'lose_fat',
      pace: 'moderate',
      kcalTarget: expected.kcal,
      proteinGTarget: expected.proteinG,
      carbsGTarget: expected.carbsG,
      fatGTarget: expected.fatG,
      isCustom: false,
      formulaVersion: expected.formulaVersion,
      startDate: TODAY,
      basisWeightKg: 70,
    });
    expect(await h.repos.settings.get('onboarding_completed_at')).not.toBeNull();
  });

  it('saves an edited proposal as a custom goal', async () => {
    const expected = proposeTargets(MAN_CORE, { type: 'maintain' }, { referenceDate: TODAY });
    if (expected.kind !== 'proposal') throw new Error('expected a proposal');

    await start();
    await acceptDisclaimer();
    await fillProfile(MAN);
    await chooseGoal('Maintain weight');
    await header('Your daily targets');

    await type('Calories (kcal)', '2000');
    expect(screen.getByText('Edited by you')).toBeOnTheScreen();
    await press('Save and continue');

    expect(await h.repos.goals.current()).toMatchObject({
      kcalTarget: 2000,
      proteinGTarget: expected.proteinG,
      carbsGTarget: expected.carbsG,
      fatGTarget: expected.fatG,
      isCustom: true,
    });
  });

  it('stores the weight as a body measurement', async () => {
    await start();
    await acceptDisclaimer();
    await fillProfile(MAN);
    await chooseGoal('Maintain weight');
    await press('Save and continue');

    const weight = await h.repos.measurements.latest('weight');
    expect(weight).toMatchObject({ value: 70, measuredOn: TODAY, source: 'manual' });
  });

  it('stores imperial input as metric', async () => {
    await start();
    await press('Continue');
    await press('I understand and accept');
    await header('About you');

    await choose('Imperial (lb, ft, in)');
    await choose('Male');
    await type('Day', '14');
    await type('Month', '5');
    await type('Year', '1990');
    await type('Height (ft)', '5');
    await type('Height (in)', '9');
    await type('Weight (lb)', '154');
    await choose('Moderately active');
    await chooseGoal('Maintain weight');
    await press('Save and continue');

    const profile = await h.repos.profile.get();
    expect(profile?.unitSystem).toBe('imperial');
    expect(profile?.heightCm).toBeCloseTo(175.3, 1);
    expect((await h.repos.measurements.latest('weight'))?.value).toBeCloseTo(69.9, 1);
  });
});

describe('onboarding: skipping the profile', () => {
  it('leads to manual targets that are saved as custom', async () => {
    await start();
    await acceptDisclaimer();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeOnTheScreen();
    await press('Skip');
    await chooseGoal('Maintain weight');

    await header('Your daily targets');
    expect(screen.getByText(/You skipped your profile/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Calories (kcal)')).toHaveDisplayValue('');

    await type('Calories (kcal)', '2200');
    await type('Protein (g)', '140');
    await press('Save and continue');

    expect(await h.repos.goals.current()).toMatchObject({
      kcalTarget: 2200,
      proteinGTarget: 140,
      carbsGTarget: null,
      fatGTarget: null,
      isCustom: true,
      formulaVersion: null,
    });
    expect(await h.repos.measurements.latest('weight')).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });

  it('rejects a manual target outside its range instead of clamping it', async () => {
    await start();
    await acceptDisclaimer();
    await press('Skip');
    await chooseGoal('Maintain weight');
    await header('Your daily targets');

    await type('Calories (kcal)', '50');
    await press('Save and continue');
    expect(screen.getByText('Enter a number from 500 to 10,000.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Calories (kcal)')).toHaveDisplayValue('50');
    expect(await h.repos.goals.current()).toBeNull();
  });
});

describe('onboarding: no proposal (S3)', () => {
  /** Calories a refused proposal would have shown, found by lowering the minimum. */
  const refusedKcal = (profile: Parameters<typeof proposeTargets>[0], goal: Parameters<typeof proposeTargets>[1]) => {
    const r = proposeTargets(profile, goal, { referenceDate: TODAY, minimumDailyKcal: 1 });
    return r.kind === 'proposal' ? r.kcal : null;
  };

  async function expectRefusal(title: string, body: RegExp) {
    await header(title);
    expect(screen.getByText(body)).toBeOnTheScreen();
    // No proposed numbers, and no way to save any: only manual targets or none.
    expect(screen.queryByLabelText('Calories (kcal)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save and continue' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Enter my own targets' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue without targets' })).toBeOnTheScreen();
  }

  it('explains under 18 and offers manual targets or none', async () => {
    const profile = { ...MAN_CORE, birthDate: '2012-03-02' };
    expect(proposeTargets(profile, { type: 'maintain' }, { referenceDate: TODAY })).toMatchObject({ reason: 'under_18' });
    const wouldBe = refusedKcal(profile, { type: 'maintain' });

    await start();
    await acceptDisclaimer();
    await fillProfile({ ...MAN, year: '2012', month: '3', day: '2' });
    await chooseGoal('Maintain weight');
    await expectRefusal('Targets are not suggested under 18', /A doctor or registered dietitian can give you targets that fit/);
    expect(JSON.stringify(screen.toJSON())).not.toContain(`"${wouldBe}"`);

    await press('Continue without targets');
    expect(onDone).toHaveBeenCalled();
    expect(await h.repos.goals.current()).toBeNull();
    expect((await h.repos.profile.get())?.birthDate).toBe('2012-03-02');
  });

  it.each([
    ['Pregnant', 'Targets are not suggested during pregnancy', /Needs change during pregnancy/],
    ['Breastfeeding', 'Targets are not suggested while breastfeeding', /Needs change while breastfeeding/],
  ])('explains %s specifically', async (condition, title, body) => {
    await start();
    await acceptDisclaimer();
    await fillProfile({ ...MAN, sex: 'Female', condition });
    await chooseGoal('Maintain weight');
    await expectRefusal(title, body);
  });

  it('names what is missing when some details were left out', async () => {
    await start();
    await acceptDisclaimer();
    await fillProfile({ sex: 'Male', kg: '70' });
    await chooseGoal('Maintain weight');
    await expectRefusal('More details are needed', /birth date, height, activity level/);

    await press('Enter my own targets');
    expect(screen.getByLabelText('Calories (kcal)')).toHaveDisplayValue('');
  });

  it('explains the minimum, and adjusting it changes the outcome', async () => {
    const profile = { sex: 'female', birthDate: '1990-01-01', heightCm: 150, weightKg: 45, activityLevel: 'sedentary' } as const;
    const goal = { type: 'lose_fat', pace: 'moderate' } as const;
    expect(proposeTargets(profile, goal, { referenceDate: TODAY })).toMatchObject({ reason: 'below_minimum', minimumKcal: 1200 });
    const lowered = proposeTargets(profile, goal, { referenceDate: TODAY, minimumDailyKcal: 1000 });
    if (lowered.kind !== 'proposal') throw new Error('expected a proposal at a minimum of 1000');
    const refused = refusedKcal(profile, goal);

    await start();
    await acceptDisclaimer();
    await fillProfile({ sex: 'Female', day: '1', month: '1', year: '1990', cm: '150', kg: '45', activity: 'Sedentary' });
    await chooseGoal('Lose fat', 'Moderate');
    await expectRefusal('This goal is below the minimum', /minimum daily energy of 1,200 kcal/);
    expect(JSON.stringify(screen.toJSON())).not.toContain(`"${refused}"`);

    await press('Change the minimum');
    await type('Minimum daily energy (kcal)', '1000');
    await press('Save minimum');

    await header('Your daily targets');
    expect(screen.getByLabelText('Calories (kcal)')).toHaveDisplayValue(String(lowered.kcal));
    expect(await h.repos.settings.get('minimum_daily_kcal')).toBe('1000');
  });
});

describe('onboarding: forms', () => {
  it('rejects impossible values with a specific message and keeps what was typed', async () => {
    await start();
    await acceptDisclaimer();

    await type('Height (cm)', '20');
    await fireEvent(screen.getByLabelText('Height (cm)'), 'blur');
    expect(screen.getByText('Height must be between 50 and 260 cm.')).toBeOnTheScreen();

    await type('Weight (kg)', '5');
    await type('Day', '31');
    await type('Month', '2');
    await type('Year', '1990');
    await press('Continue');

    expect(screen.getByText('Weight must be between 20 and 500 kg.')).toBeOnTheScreen();
    expect(screen.getByText('That date does not exist.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Height (cm)')).toHaveDisplayValue('20');
    expect(screen.getByLabelText('Weight (kg)')).toHaveDisplayValue('5');
    expect(screen.queryByRole('header', { name: 'What is your goal?' })).toBeNull();
  });

  it('rejects a birth date in the future', async () => {
    await start();
    await acceptDisclaimer();
    await type('Day', '1');
    await type('Month', '1');
    await type('Year', '2030');
    await press('Continue');
    expect(screen.getByText('The birth date cannot be in the future.')).toBeOnTheScreen();
  });
});
