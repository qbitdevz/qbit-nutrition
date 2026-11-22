import { createHarness, type Harness } from '@/data/testing/harness';
import { seedSampleDay } from '../devSeed';
import { loadToday } from '../loadToday';

const NOW = new Date(2026, 10, 21, 19, 40);

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

describe('loadToday', () => {
  it('reads totals, meals and the goal that applied on that date', async () => {
    await seedSampleDay(h.repos, NOW);
    const data = await loadToday({ repos: h.repos, localDate: '2026-11-21', now: NOW });

    expect(data.isToday).toBe(true);
    expect(data.totals).toEqual({ kcal: 1236, proteinG: 78, carbsG: 131, fatG: 47 });
    expect(data.targets).toEqual({ kcal: 2100, proteinG: 150, carbsG: 220, fatG: 70 });
    expect(data.meals.map((m) => [m.name, m.slot, m.kcal])).toEqual([
      ['Greek yogurt, berries, granola', 'breakfast', 412],
      ['Chicken burrito bowl', 'lunch', 624],
      ['Banana and cottage cheese', 'snack', 200],
    ]);
  });

  it('picks the protein insight late in the day and none earlier', async () => {
    await seedSampleDay(h.repos, NOW);
    const late = await loadToday({ repos: h.repos, localDate: '2026-11-21', now: NOW });
    expect(late.insight).toEqual({ code: 'protein_low_late', consumedG: 78, targetG: 150, remainingG: 72 });

    // At 10:00 the protein rule is not due; calories remain and lunch is empty only after 15:00, so nothing applies.
    const morning = await loadToday({ repos: h.repos, localDate: '2026-11-21', now: new Date(2026, 10, 21, 10, 0) });
    expect(morning.insight).toBeNull();
  });

  it('gives no insight for a past day, whose time-of-day rules would be meaningless', async () => {
    await seedSampleDay(h.repos, NOW);
    const past = await loadToday({ repos: h.repos, localDate: '2026-11-20', now: NOW });
    expect(past.isToday).toBe(false);
    expect(past.meals).toHaveLength(3);
    expect(past.insight).toBeNull();
  });

  it('uses the targets of the period that applied on a past date, not today’s', async () => {
    await h.repos.goals.set({ type: 'maintain', startDate: '2026-10-01', kcalTarget: 1800, proteinGTarget: 120, carbsGTarget: 200, fatGTarget: 60 });
    await h.repos.goals.set({ type: 'maintain', startDate: '2026-11-10', kcalTarget: 2200, proteinGTarget: 160, carbsGTarget: 240, fatGTarget: 75 });

    expect((await loadToday({ repos: h.repos, localDate: '2026-11-05', now: NOW })).targets.kcal).toBe(1800);
    expect((await loadToday({ repos: h.repos, localDate: '2026-11-21', now: NOW })).targets.kcal).toBe(2200);
  });

  it('returns null targets when no goal applies, and zeros for an empty day', async () => {
    const data = await loadToday({ repos: h.repos, localDate: '2026-11-21', now: NOW });
    expect(data.targets).toEqual({ kcal: null, proteinG: null, carbsG: null, fatG: null });
    expect(data.totals).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    expect(data.meals).toEqual([]);
    expect(data.insight).toBeNull();
  });

  it('rejects a malformed date instead of guessing', async () => {
    await expect(loadToday({ repos: h.repos, localDate: 'yesterday', now: NOW })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('seedSampleDay (development only)', () => {
  it('inserts a profile, a goal and meals, and does nothing the second time', async () => {
    expect(await seedSampleDay(h.repos, NOW)).toBe(true);
    expect(await h.repos.profile.get()).not.toBeNull();
    expect((await h.repos.goals.current())?.kcalTarget).toBe(2100);
    expect((await h.repos.meals.getDay('2026-11-21')).meals).toHaveLength(3);

    expect(await seedSampleDay(h.repos, NOW)).toBe(false);
    expect((await h.repos.meals.getDay('2026-11-21')).meals).toHaveLength(3);
  });
});
