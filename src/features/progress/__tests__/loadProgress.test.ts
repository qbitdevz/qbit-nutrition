import { createHarness, type Harness } from '@/data/testing/harness';
import { loadNutrition, loadSeries } from '../loadProgress';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

async function logDay(date: string, kcal: number, protein: number, carbs: number, fat: number) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  await h.repos.meals.save({
    eatenAt: new Date(Date.UTC(y, m - 1, d, 12)),
    timeZone: 'UTC',
    slot: 'lunch',
    source: 'manual',
    items: [{ displayName: 'Meal', grams: 100, foodSource: 'ai_estimate', foodRef: null, origin: 'manual', nutrients: { kcal, protein, carbs, fat } }],
  });
}

describe('loadNutrition', () => {
  it('averages the logged days of a week that spans two months against the goal of each day', async () => {
    await h.repos.goals.set({ type: 'maintain', startDate: '2026-01-01', kcalTarget: 2000, proteinGTarget: 100, carbsGTarget: 250, fatGTarget: 67 });
    await h.repos.goals.set({ type: 'lose_fat', startDate: '2026-04-01', kcalTarget: 1800, proteinGTarget: 120, carbsGTarget: 200, fatGTarget: 60 });
    await logDay('2026-03-30', 1900, 90, 200, 60);
    await logDay('2026-03-31', 2100, 110, 210, 70);
    await logDay('2026-04-02', 1700, 130, 150, 50);
    await logDay('2026-04-03', 1800, 125, 160, 55);
    // Outside the week: must not count.
    await logDay('2026-04-07', 5000, 1, 1, 1);

    const week = await loadNutrition({ repos: h.repos, kind: 'week', anchor: '2026-04-01' });
    expect(week.range).toEqual({ from: '2026-03-30', to: '2026-04-05' });
    expect(week.status).toBe('average');
    expect(week.loggedDays).toBe(4);
    expect(week.average).toEqual({ kcal: 1875, proteinG: 113.75, carbsG: 180, fatG: 58.75 });
    expect(week.targets?.kcal).toBe(1900);
    expect(week.targetsChanged).toBe(true);
  });

  it('a month holds only its own days', async () => {
    await logDay('2026-03-31', 2000, 100, 200, 60);
    await logDay('2026-04-01', 2000, 100, 200, 60);
    const march = await loadNutrition({ repos: h.repos, kind: 'month', anchor: '2026-03-15' });
    expect(march.loggedDays).toBe(1);
    expect(march.status).toBe('partial');
  });

  it('is empty on a fresh database', async () => {
    const week = await loadNutrition({ repos: h.repos, kind: 'week', anchor: '2026-04-01' });
    expect(week.status).toBe('empty');
  });
});

describe('loadSeries', () => {
  it('returns one point per day in metric with the units of the profile', async () => {
    await h.repos.profile.save({ unitSystem: 'imperial', locale: 'en', disclaimerAcceptedAt: '2026-01-01T00:00:00.000Z', disclaimerVersion: 'v' });
    await h.repos.measurements.record({ measuredOn: '2026-06-02', kind: 'weight', value: 81 });
    await h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82 });
    await h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'waist', value: 90 });
    const data = await loadSeries({ repos: h.repos, kind: 'weight' });
    expect(data.units).toBe('imperial');
    expect(data.points.map((p) => [p.date, p.value])).toEqual([
      ['2026-06-01', 82],
      ['2026-06-02', 81],
    ]);
  });

  it('defaults to metric without a profile and is empty without entries', async () => {
    const data = await loadSeries({ repos: h.repos, kind: 'hips' });
    expect(data).toEqual({ units: 'metric', points: [] });
  });
});
