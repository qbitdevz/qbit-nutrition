import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { processColor } from 'react-native';

import { createHarness, type Harness } from '@/data/testing/harness';
import { palette } from '@/ui/tokens';
import { renderApp, servicesFrom } from '../../testing/renderApp';
import { seedSampleDay } from '../devSeed';
import { TodayScreen } from '../TodayScreen';

// 21 Nov 2026, 19:40 local: late enough for the protein insight, like the artboard.
const NOW = new Date(2026, 10, 21, 19, 40);
const clock = () => new Date(NOW);

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => {
  await cleanup();
  h.close();
  jest.restoreAllMocks();
});

const screenUnderTest = <TodayScreen now={clock} onOpenSettings={jest.fn()} />;

const goal = (over: Record<string, number | null> = {}, startDate = '2026-10-01') =>
  h.repos.goals.set({
    type: 'maintain',
    startDate,
    kcalTarget: 2100,
    proteinGTarget: 150,
    carbsGTarget: 220,
    fatGTarget: 70,
    ...over,
  });

describe('Today with data from the repositories', () => {
  beforeEach(async () => {
    await seedSampleDay(h.repos, NOW);
  });

  it('shows the exact calories left and eaten against the goal', async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h) });

    const ring = await screen.findByRole('progressbar', { name: '864 kilocalories left. 1,236 of 2,100 eaten.' });
    expect(within(ring).getByText('864')).toBeOnTheScreen();
    expect(within(ring).getByText('kcal left')).toBeOnTheScreen();
    // The caption under the ring is visible text; screen readers get the same numbers from the ring's label.
    expect(screen.getByText(/eaten of 2,100 kcal/, { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('shows protein, carbs and fat against their targets', async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h) });

    const protein = await screen.findByRole('progressbar', { name: 'Protein, 78 of 150 grams' });
    expect(within(protein).getByText('78')).toBeOnTheScreen();
    expect(within(protein).getByText(/\/ 150 g/)).toBeOnTheScreen();
    const carbs = screen.getByRole('progressbar', { name: 'Carbs, 131 of 220 grams' });
    expect(within(carbs).getByText('131')).toBeOnTheScreen();
    const fat = screen.getByRole('progressbar', { name: 'Fat, 47 of 70 grams' });
    expect(within(fat).getByText('47')).toBeOnTheScreen();
  });

  it('shows one insight, translated in the UI layer', async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h) });

    expect(await screen.findByText('72 g of protein left to reach your target.')).toBeOnTheScreen();
    expect(screen.getAllByTestId('insight')).toHaveLength(1);
  });

  it("lists the day's meals with slot, time and calories", async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h) });

    await screen.findByText('Meals');
    expect(screen.getByText('3 meals')).toBeOnTheScreen();
    expect(screen.getByLabelText('Greek yogurt, berries, granola, Breakfast at 08:05, 412 kilocalories')).toBeOnTheScreen();
    expect(screen.getByLabelText('Chicken burrito bowl, Lunch at 13:10, 624 kilocalories')).toBeOnTheScreen();
    expect(screen.getByLabelText('Banana and cottage cheese, Snack at 16:30, 200 kilocalories')).toBeOnTheScreen();
    expect(screen.getByText('Breakfast · 08:05')).toBeOnTheScreen();
  });

  it('opens a past day with the arrows and goes back to today', async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h) });
    await screen.findByText('Meals');

    // Today: the next-day arrow is present but not available, and says so.
    expect(screen.getByRole('button', { name: 'Next day, not available', disabled: true })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    expect(await screen.findByText('Oatmeal with banana')).toBeOnTheScreen();
    expect(screen.queryByText('Chicken burrito bowl')).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Yesterday, Fri, Nov 20' })).toBeOnTheScreen();
    // 380 + 640 + 520 eaten against 2,100.
    expect(await screen.findByRole('progressbar', { name: '560 kilocalories left. 1,540 of 2,100 eaten.' })).toBeOnTheScreen();
    // No time-of-day insight on a finished day.
    expect(screen.queryByTestId('insight')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Next day' }));
    expect(await screen.findByText('Chicken burrito bowl')).toBeOnTheScreen();
  });

  it('shows a day that has no meals as an empty past day, not as a first-meal prompt', async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h) });
    await screen.findByText('Meals');

    await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByText('Oatmeal with banana');
    await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));

    expect(await screen.findByText('Nothing logged on this day')).toBeOnTheScreen();
    expect(screen.queryByText('Scan your first meal')).not.toBeOnTheScreen();
  });
});

describe('Today states', () => {
  it('first day: full targets and a prompt to scan the first meal', async () => {
    await goal();
    await renderApp(screenUnderTest, { services: servicesFrom(h) });

    expect(await screen.findByText('Scan your first meal')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '2,100 kilocalories left. 0 of 2,100 eaten.' })).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Protein, 0 of 150 grams' })).toBeOnTheScreen();
    expect(screen.queryByText('Meals')).not.toBeOnTheScreen();
  });

  it('loading: a skeleton with a spoken label until the repositories answer', async () => {
    const never = new Promise<never>(() => undefined);
    const repos = { ...h.repos, meals: { ...h.repos.meals, getDay: () => never } };
    await renderApp(screenUnderTest, { services: servicesFrom(h, repos) });

    expect(await screen.findByRole('progressbar', { name: 'Loading your day' })).toBeOnTheScreen();
    expect(screen.queryByText('Meals')).not.toBeOnTheScreen();
  });

  it('error: says what happened, keeps the data safe, and retries', async () => {
    await seedSampleDay(h.repos, NOW);
    const getDay = jest.spyOn(h.repos.meals, 'getDay').mockRejectedValueOnce(new Error('disk I/O error'));
    await renderApp(screenUnderTest, { services: servicesFrom(h) });

    expect(await screen.findByText('Your day could not be loaded')).toBeOnTheScreen();
    expect(screen.getByText(/Your data is still on this phone/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Chicken burrito bowl')).toBeOnTheScreen();
    expect(getDay).toHaveBeenCalledTimes(2);
  });

  it('no targets set: shows what was eaten, says targets are missing, and still counts meals', async () => {
    await seedSampleDay(h.repos, NOW);
    // A goal-less database: remove the seeded goal period by reading a date before it started.
    await renderApp(
      <TodayScreen now={() => new Date(2026, 8, 20, 19, 40)} onOpenSettings={jest.fn()} />,
      { services: servicesFrom(h) },
    );
    expect(await screen.findByText('No daily targets are set yet. Your meals are still counted.')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '0 kilocalories eaten. No calorie target is set.' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Protein, 0 grams')).toBeOnTheScreen();
  });

  it('no targets set, with meals: eaten calories in the ring and macros without a target', async () => {
    await h.repos.meals.save({
      eatenAt: new Date(2026, 10, 21, 12, 0),
      slot: 'lunch',
      source: 'manual',
      items: [{ displayName: 'Rice', grams: 200, foodSource: 'custom', foodRef: null, origin: 'manual', nutrients: { kcal: 260, protein: 5, carbs: 56, fat: 1 } }],
    });
    await renderApp(screenUnderTest, { services: servicesFrom(h) });

    expect(await screen.findByRole('progressbar', { name: '260 kilocalories eaten. No calorie target is set.' })).toBeOnTheScreen();
    expect(screen.getByText('kcal eaten')).toBeOnTheScreen();
    expect(screen.getByTestId('insight')).toHaveAccessibleName('No daily targets are set yet. Your meals are still counted.');
    expect(screen.getByLabelText('Carbs, 56 grams')).toBeOnTheScreen();
    expect(screen.getByLabelText('Rice, Lunch at 12:00, 260 kilocalories')).toBeOnTheScreen();
  });

  it('over target: neutral wording, the amount over in text, and no warning colour', async () => {
    await seedSampleDay(h.repos, NOW);
    // The seed opened its goal 30 days before today (22 Oct); changing it that day replaces it.
    await goal({ kcalTarget: 1000 }, '2026-10-22');
    await renderApp(screenUnderTest, { services: servicesFrom(h) });

    const ring = await screen.findByRole('progressbar', { name: '236 kilocalories over the target. 1,236 eaten of 1,000.' });
    expect(within(ring).getByText('236')).toBeOnTheScreen();
    expect(within(ring).getByText('kcal over target')).toBeOnTheScreen();
    // The arc stays the primary blue: the design system has no danger colour and going over is not an alert.
    expect(screen.getByTestId('ring-arc').props.stroke).toEqual({ type: 0, payload: processColor(palette.dark.primary) });
    expect(Object.keys(palette.dark)).not.toContain('danger');
    expect(screen.queryByTestId('error-state')).not.toBeOnTheScreen();
  });
});

describe('language and motion', () => {
  beforeEach(async () => {
    await seedSampleDay(h.repos, NOW);
  });

  it('renders in Spanish with the same numbers', async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h), locale: 'es' });

    expect(await screen.findByText('Comidas')).toBeOnTheScreen();
    expect(screen.getByText('kcal restantes')).toBeOnTheScreen();
    expect(screen.getByText('Te faltan 72 g de proteína para llegar a tu objetivo.')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: /^Quedan 864 kilocalorías\. Consumiste/ })).toBeOnTheScreen();
    expect(screen.getByLabelText('Chicken burrito bowl, Almuerzo a las 13:10, 624 kilocalorías')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Día anterior' })).toBeOnTheScreen();
  });

  it('renders in English', async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h), locale: 'en' });
    expect(await screen.findByText('Meals')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeOnTheScreen();
  });

  it('reduced motion: the final numbers are on screen as soon as the data is', async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h), reducedMotion: true });

    const ring = await screen.findByTestId('calorie-ring');
    expect(within(ring).getByText('864')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Protein, 78 of 150 grams' })).toBeOnTheScreen();
    expect(within(screen.getByTestId('macro-protein')).getByText('78')).toBeOnTheScreen();
    // The arc is drawn at its final length from the first frame: 864 left is 58.8 % eaten.
    const circumference = 2 * Math.PI * 96;
    const offset = Number(screen.getByTestId('ring-arc').props.strokeDashoffset);
    expect(offset).toBeCloseTo(circumference * (1 - 1236 / 2100), 0);
  });

  it('with motion on, the ring number counts down from the target instead of jumping', async () => {
    await renderApp(screenUnderTest, { services: servicesFrom(h), reducedMotion: false });

    const ring = await screen.findByTestId('calorie-ring');
    // It starts at the target and the spoken summary already has the final value.
    expect(within(ring).getByText('2,100')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '864 kilocalories left. 1,236 of 2,100 eaten.' })).toBeOnTheScreen();
    await waitFor(() => expect(within(screen.getByTestId('calorie-ring')).getByText('864')).toBeOnTheScreen(), { timeout: 3000 });
  });
});
