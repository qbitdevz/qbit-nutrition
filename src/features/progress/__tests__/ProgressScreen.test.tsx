import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { renderApp, servicesFrom } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { ProgressScreen } from '../ProgressScreen';

// Wednesday 1 April 2026: its week runs Mon 30 March to Sun 5 April, across two months.
const NOW = new Date(2026, 3, 1, 12, 0);
const clock = () => new Date(NOW);

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

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const choose = (name: string | RegExp) => fireEvent.press(screen.getByRole('radio', { name }));
const open = (locale: 'en' | 'es' = 'en', over = services) => renderApp(<ProgressScreen now={clock} />, { services: over, locale });

async function logDay(date: string, kcal: number, protein: number, carbs: number, fat: number) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  await h.repos.meals.save({
    eatenAt: new Date(y, m - 1, d, 12),
    slot: 'lunch',
    source: 'manual',
    items: [{ displayName: 'Meal', grams: 100, foodSource: 'ai_estimate', foodRef: null, origin: 'manual', nutrients: { kcal, protein, carbs, fat } }],
  });
}

async function seedWeek() {
  await h.repos.goals.set({ type: 'maintain', startDate: '2026-01-01', kcalTarget: 2000, proteinGTarget: 100, carbsGTarget: 250, fatGTarget: 67 });
  await h.repos.goals.set({ type: 'lose_fat', startDate: '2026-04-01', kcalTarget: 1800, proteinGTarget: 120, carbsGTarget: 200, fatGTarget: 60 });
  await logDay('2026-03-30', 1900, 90, 200, 60);
  await logDay('2026-03-31', 2100, 110, 210, 70);
  await logDay('2026-04-01', 1700, 130, 150, 50);
  await logDay('2026-04-02', 1800, 125, 160, 55);
}

describe('Progress: nutrition averages (FR-43)', () => {
  it('invites logging when there is nothing yet', async () => {
    await open();
    expect(await screen.findByText('Log a few days to see trends')).toBeOnTheScreen();
    expect(screen.queryByText('Average per logged day')).not.toBeOnTheScreen();
  });

  it('shows the loading state until the data arrives', async () => {
    let release: (value: Awaited<ReturnType<typeof h.repos.meals.totalsByDay>>) => void = () => undefined;
    const slow = new Promise<Awaited<ReturnType<typeof h.repos.meals.totalsByDay>>>((resolve) => (release = resolve));
    const delayed = { ...h.repos, meals: { ...h.repos.meals, totalsByDay: jest.fn().mockReturnValueOnce(slow) } };
    await open('en', { ...services, repos: delayed as typeof h.repos });
    expect(screen.getByTestId('progress-loading')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Loading your progress' })).toBeOnTheScreen();
    release([]);
    expect(await screen.findByText('Log a few days to see trends')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-loading')).not.toBeOnTheScreen();
  });

  it('shows the week average over the logged days, how many they are, and the targets of each day', async () => {
    await seedWeek();
    await open();
    expect(await screen.findByText('Average per logged day')).toBeOnTheScreen();
    expect(screen.getByText('4 of 7 days logged')).toBeOnTheScreen();
    expect(screen.getByText('1,875')).toBeOnTheScreen(); // (1900 + 2100 + 1700 + 1800) / 4; with reduced motion the count is already final
    expect(screen.getByText('Mar 30 – Apr 5')).toBeOnTheScreen();
    // Two days under the 2,000 target and two under the 1,800 one: the shown target is their average, 1,900.
    expect(screen.getByText('Target 1,900 kcal')).toBeOnTheScreen();
    expect(screen.getByText('25 kcal under target')).toBeOnTheScreen();
    expect(screen.getByText(/targets changed during this period/i)).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Protein, 114 of 110 grams' })).toBeOnTheScreen();
  });

  it('with too few logged days it lists them and shows no average', async () => {
    await logDay('2026-03-30', 1900, 90, 200, 60);
    await logDay('2026-03-31', 2100, 110, 210, 70);
    await open();
    expect(await screen.findByText(/Only 2 days have meals/)).toBeOnTheScreen();
    expect(screen.queryByText('Average per logged day')).not.toBeOnTheScreen();
    expect(screen.getByText('Mon, Mar 30')).toBeOnTheScreen();
    expect(screen.getByText('90 g protein · 200 g carbs · 60 g fat')).toBeOnTheScreen();
  });

  it('moves to the previous week and back, and cannot go past the current one', async () => {
    await seedWeek();
    await open();
    await screen.findByText('Average per logged day');
    expect(screen.getByLabelText('Next period, not available')).toBeDisabled();

    await press('Previous week');
    expect(await screen.findByText('Mar 23 – Mar 29')).toBeOnTheScreen();
    expect(await screen.findByText('Log a few days to see trends')).toBeOnTheScreen();

    await press('Next week');
    expect(await screen.findByText('Average per logged day')).toBeOnTheScreen();
  });

  it('switches to the month, which counts only its own days', async () => {
    await seedWeek();
    await open();
    await screen.findByText('Average per logged day');
    await choose('Month');
    // April has two logged days (1 and 2 April): fewer than a month needs.
    expect(await screen.findByText('April 2026')).toBeOnTheScreen();
    expect(await screen.findByText(/Only 2 days have meals/)).toBeOnTheScreen();
    await press('Previous month');
    expect(await screen.findByText('March 2026')).toBeOnTheScreen();
    expect(await screen.findByText(/Only 2 days have meals/)).toBeOnTheScreen();
  });

  it('says so and offers a retry when the data cannot be read', async () => {
    const real = h.repos.meals.totalsByDay;
    let failed = false;
    const totalsByDay: typeof real = (...args) => (failed ? real(...args) : ((failed = true), Promise.reject(new Error('disk'))));
    const failing = { ...h.repos, meals: { ...h.repos.meals, totalsByDay } };
    await open('en', { ...services, repos: failing as typeof h.repos });
    expect(await screen.findByText('Your progress could not be loaded')).toBeOnTheScreen();
    await press('Try again');
    expect(await screen.findByText('Log a few days to see trends')).toBeOnTheScreen();
  });

  it('is in Spanish too', async () => {
    await seedWeek();
    await open('es');
    expect(await screen.findByText('Promedio por día registrado')).toBeOnTheScreen();
    expect(screen.getByText('4 de 7 días registrados')).toBeOnTheScreen();
    expect(screen.getByText('Objetivo 1900 kcal')).toBeOnTheScreen();
  });
});

describe('Progress: weight (FR-44)', () => {
  const weightTab = () => choose('Weight');

  it('starts empty and logs a weight for today', async () => {
    await open();
    await screen.findByText('Log a few days to see trends');
    await weightTab();
    expect(await screen.findByText('No weight logged yet')).toBeOnTheScreen();

    await press('Log weight');
    await fireEvent.changeText(screen.getByTestId('entry-value'), '82,4');
    await press('Save');

    await waitFor(async () => expect((await h.repos.measurements.latest('weight'))?.value).toBe(82.4));
    expect((await h.repos.measurements.latest('weight'))?.measuredOn).toBe('2026-04-01');
    // One entry: a point and a message, no trend line to describe.
    expect(await screen.findByText('One entry so far. Log another day to see a trend.')).toBeOnTheScreen();
    expect(screen.getByRole('image', { name: /one entry, 82\.4 kilograms/ })).toBeOnTheScreen();
    expect(screen.getByText('Weight saved · 82.4 kg')).toBeOnTheScreen();
  });

  it('keeps what was typed and says what is wrong when the value is not valid', async () => {
    await h.repos.measurements.record({ measuredOn: '2026-03-30', kind: 'weight', value: 80 });
    await open();
    await weightTab();
    await screen.findByText('Latest');
    await press('Log weight');
    await fireEvent.changeText(screen.getByTestId('entry-value'), 'abc');
    await press('Save');
    expect(await screen.findByText('Use numbers only, for example 82.5.')).toBeOnTheScreen();
    expect(screen.getByTestId('entry-value').props.value).toBe('abc');
    await fireEvent.changeText(screen.getByTestId('entry-value'), '10');
    await press('Save');
    expect(await screen.findByText('Weight must be between 20 and 500 kg.')).toBeOnTheScreen();
    expect(await h.repos.measurements.list('weight')).toHaveLength(1);
  });

  it('shows the trend with a spoken summary and a list of every point', async () => {
    await h.repos.measurements.record({ measuredOn: '2026-03-10', kind: 'weight', value: 83 });
    await h.repos.measurements.record({ measuredOn: '2026-03-20', kind: 'weight', value: 82 });
    await h.repos.measurements.record({ measuredOn: '2026-03-31', kind: 'weight', value: 81.5 });
    await open();
    await weightTab();
    const chart = await screen.findByRole('image', { name: /^Weight, last 90 days: 3 entries/ });
    expect(chart.props.accessibilityLabel).toBe(
      'Weight, last 90 days: 3 entries from Mar 10, 2026 (83 kilograms) to Mar 31, 2026 (81.5 kilograms). Change -1.5 kilograms. Lowest 81.5, highest 83 kilograms.',
    );
    // The same points are rows a reader can walk through.
    expect(screen.getByRole('button', { name: 'Mar 31, 2026, 81.5 kilograms. Edit this entry.' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mar 10, 2026, 83 kilograms. Edit this entry.' })).toBeOnTheScreen();
    // Visible, not only spoken: the latest value and the change.
    expect(screen.getAllByText(/^81\.5 kg/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^-1\.5 kg/)).toBeOnTheScreen();
  });

  it('limits the range and says when it holds no entries', async () => {
    await h.repos.measurements.record({ measuredOn: '2025-01-10', kind: 'weight', value: 83 });
    await open();
    await weightTab();
    await screen.findByText(/No entries in this range/); // the default range is 90 days
    await choose('30 days');
    expect(await screen.findByText(/No entries in this range/)).toBeOnTheScreen();
    await choose('All');
    expect(await screen.findByRole('image', { name: /one entry/ })).toBeOnTheScreen();
  });

  it('edits an entry: a new value and another day', async () => {
    const m = await h.repos.measurements.record({ measuredOn: '2026-03-30', kind: 'weight', value: 80 });
    await h.repos.measurements.record({ measuredOn: '2026-03-31', kind: 'weight', value: 79 });
    await open();
    await weightTab();
    await screen.findByText('Latest');
    await press('Mar 30, 2026, 80 kilograms. Edit this entry.');
    expect(screen.getByTestId('entry-value').props.value).toBe('80');
    await fireEvent.changeText(screen.getByTestId('entry-value'), '80.6');
    await press('Previous day');
    await press('Save');
    await waitFor(async () => expect((await h.repos.measurements.list('weight'))[0]).toMatchObject({ id: m.id, measuredOn: '2026-03-29', value: 80.6 }));
  });

  it('refuses to move an entry onto a day that has one, and keeps both', async () => {
    await h.repos.measurements.record({ measuredOn: '2026-03-30', kind: 'weight', value: 80 });
    await h.repos.measurements.record({ measuredOn: '2026-03-31', kind: 'weight', value: 79 });
    await open();
    await weightTab();
    await screen.findByText('Latest');
    await press('Mar 31, 2026, 79 kilograms. Edit this entry.');
    await press('Previous day');
    await press('Save');
    expect(await screen.findByText('That day already has an entry. Pick another day, or edit that entry.')).toBeOnTheScreen();
    expect((await h.repos.measurements.list('weight')).map((x) => [x.measuredOn, x.value])).toEqual([
      ['2026-03-30', 80],
      ['2026-03-31', 79],
    ]);
  });

  it('deletes an entry only after asking, and Undo brings it back', async () => {
    await h.repos.measurements.record({ measuredOn: '2026-03-30', kind: 'weight', value: 80 });
    await open();
    await weightTab();
    await screen.findByText('Latest');
    await press('Mar 30, 2026, 80 kilograms. Edit this entry.');
    await press('Delete entry');
    // Asking first: nothing is deleted yet, and the safe choice is the primary button.
    expect(screen.getByText('Delete this entry?')).toBeOnTheScreen();
    expect(await h.repos.measurements.list('weight')).toHaveLength(1);
    await press('Keep entry');
    expect(await h.repos.measurements.list('weight')).toHaveLength(1);

    await press('Delete entry');
    await fireEvent.press(screen.getByTestId('confirm-delete'));
    await waitFor(async () => expect(await h.repos.measurements.list('weight')).toHaveLength(0));
    expect(await screen.findByText('Entry deleted')).toBeOnTheScreen();

    await press('Undo');
    await waitFor(async () => expect((await h.repos.measurements.list('weight')).map((x) => [x.measuredOn, x.value])).toEqual([['2026-03-30', 80]]));
  });

  it('says what a save replaces when the day already has an entry', async () => {
    await h.repos.measurements.record({ measuredOn: '2026-04-01', kind: 'weight', value: 80 });
    await open();
    await weightTab();
    await screen.findByText('Latest');
    await press('Log weight');
    expect(screen.getByText('This day already has an entry (80 kg). Saving replaces it.')).toBeOnTheScreen();
  });

  it('takes pounds from an imperial profile and stores kilograms', async () => {
    await h.repos.profile.save({ unitSystem: 'imperial', locale: 'en', disclaimerAcceptedAt: '2026-01-01T00:00:00.000Z', disclaimerVersion: 'v' });
    await open();
    await weightTab();
    await screen.findByText('No weight logged yet');
    await press('Log weight');
    await fireEvent.changeText(screen.getByTestId('entry-value'), '180.5');
    expect(screen.getByText('lb', { hidden: true })).toBeOnTheScreen(); // the unit sits inside the field
    await press('Save');
    await waitFor(async () => expect((await h.repos.measurements.latest('weight'))?.value).toBe(81.873));
    expect(await screen.findByText('Weight saved · 180.5 lb')).toBeOnTheScreen();
  });

  it('says so and offers a retry when the entries cannot be read', async () => {
    const real = h.repos.measurements.list;
    let failed = false;
    const list: typeof real = (...args) => (failed ? real(...args) : ((failed = true), Promise.reject(new Error('disk'))));
    const failing = { ...h.repos, measurements: { ...h.repos.measurements, list } };
    await open('en', { ...servicesFrom(h, failing as typeof h.repos), close: services.close, secrets: services.secrets });
    await weightTab();
    expect(await screen.findByText('Your progress could not be loaded')).toBeOnTheScreen();
    await press('Try again');
    expect(await screen.findByText('No weight logged yet')).toBeOnTheScreen();
  });
});

describe('Progress: body measurements (FR-45)', () => {
  it('logs a waist and a hip measurement and charts each one apart', async () => {
    await open();
    await screen.findByText('Log a few days to see trends');
    await choose('Measures');
    expect(await screen.findByText('No waist logged yet')).toBeOnTheScreen();

    await press('Log waist');
    await fireEvent.changeText(screen.getByTestId('entry-value'), '90');
    await press('Save');
    await waitFor(async () => expect((await h.repos.measurements.latest('waist'))?.value).toBe(90));

    await choose('Hips');
    expect(await screen.findByText('No hips logged yet')).toBeOnTheScreen();
    await press('Log hips');
    await fireEvent.changeText(screen.getByTestId('entry-value'), '101.5');
    await press('Save');
    await waitFor(async () => expect((await h.repos.measurements.latest('hips'))?.value).toBe(101.5));

    await choose('Waist');
    expect(await screen.findByRole('image', { name: /^Waist, last 90 days: one entry, 90 centimeters/ })).toBeOnTheScreen();
  });

  it('keeps body fat in percent whatever the unit system', async () => {
    await h.repos.profile.save({ unitSystem: 'imperial', locale: 'en', disclaimerAcceptedAt: '2026-01-01T00:00:00.000Z', disclaimerVersion: 'v' });
    await open();
    await choose('Measures');
    await choose('Body fat');
    await press('Log body fat');
    await fireEvent.changeText(screen.getByTestId('entry-value'), '18.4');
    expect(screen.getByText('%', { hidden: true })).toBeOnTheScreen();
    await press('Save');
    await waitFor(async () => expect((await h.repos.measurements.latest('body_fat_pct'))?.value).toBe(18.4));
  });

  it('shows two or more entries as a line chart with a change', async () => {
    await h.repos.measurements.record({ measuredOn: '2026-03-10', kind: 'chest', value: 100 });
    await h.repos.measurements.record({ measuredOn: '2026-03-31', kind: 'chest', value: 99 });
    await open();
    await choose('Measures');
    await choose('Chest');
    expect(await screen.findByRole('image', { name: /^Chest, last 90 days: 2 entries/ })).toBeOnTheScreen();
    expect(screen.getByText(/^-1 cm/)).toBeOnTheScreen();
  });
});
