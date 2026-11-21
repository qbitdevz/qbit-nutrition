/** @jest-environment node */
import { sql } from 'drizzle-orm';
import { expectDataError } from '../testing/expectations';
import { createHarness, type Harness } from '../testing/harness';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const lose = { type: 'lose_fat', pace: 'gentle', kcalTarget: 1800, proteinGTarget: 130, carbsGTarget: 180, fatGTarget: 60 } as const;
const maintain = { type: 'maintain', kcalTarget: 2200, proteinGTarget: 110, carbsGTarget: 260, fatGTarget: 70 } as const;

describe('GoalRepository', () => {
  it('has no goal at first, then the first goal is the current one', async () => {
    const { goals } = h.repos;
    expect(await goals.current()).toBeNull();
    const g = await goals.set({ ...lose, startDate: '2026-03-01', isCustom: false, basisWeightKg: 82, formulaVersion: 'v1' });
    expect(g).toMatchObject({ type: 'lose_fat', startDate: '2026-03-01', endDate: null, kcalTarget: 1800, isCustom: false, basisWeightKg: 82 });
    expect(await goals.current()).toEqual(g);
  });

  it('closes the current period the day before and opens a new one; earlier days keep their targets', async () => {
    const { goals } = h.repos;
    await goals.set({ ...lose, startDate: '2026-03-01' });
    await goals.set({ ...maintain, startDate: '2026-04-10' });

    const history = await goals.history();
    expect(history.map((g) => [g.type, g.startDate, g.endDate])).toEqual([
      ['lose_fat', '2026-03-01', '2026-04-09'],
      ['maintain', '2026-04-10', null],
    ]);
    expect((await goals.current())?.kcalTarget).toBe(2200);

    expect((await goals.on('2026-03-01'))?.kcalTarget).toBe(1800);
    expect((await goals.on('2026-04-09'))?.kcalTarget).toBe(1800); // last day of the old period
    expect((await goals.on('2026-04-10'))?.kcalTarget).toBe(2200); // first day of the new one
    expect((await goals.on('2026-12-31'))?.kcalTarget).toBe(2200);
    expect(await goals.on('2026-02-28')).toBeNull(); // before any goal
  });

  it('replaces the current period in place when the goal changes on its start day', async () => {
    const { goals } = h.repos;
    await goals.set({ ...lose, startDate: '2026-03-01' });
    await goals.set({ ...lose, kcalTarget: 1700, isCustom: true, startDate: '2026-03-01' });
    const history = await goals.history();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kcalTarget: 1700, isCustom: true, endDate: null });
  });

  it('refuses a change dated before the current period starts', async () => {
    const { goals } = h.repos;
    await goals.set({ ...lose, startDate: '2026-03-10' });
    await expectDataError(goals.set({ ...maintain, startDate: '2026-03-01' }), 'goal_date_conflict');
    expect(await goals.history()).toHaveLength(1);
  });

  it('allows tracking without targets (null targets)', async () => {
    const { goals } = h.repos;
    const g = await goals.set({ type: 'maintain', startDate: '2026-03-01' });
    expect(g).toMatchObject({ kcalTarget: null, proteinGTarget: null, carbsGTarget: null, fatGTarget: null });
  });

  it('does not close the current period when the new one cannot be stored', async () => {
    const { goals } = h.repos;
    await goals.set({ ...lose, startDate: '2026-03-01' });
    await expect(goals.set({ ...maintain, type: 'bogus' as never, startDate: '2026-04-10' })).rejects.toThrow();
    const history = await goals.history();
    expect(history).toHaveLength(1);
    expect(history[0]?.endDate).toBeNull();
  });

  it('keeps at most one open period at the database level', () => {
    const insert = (id: string) =>
      h.db.run(
        sql`INSERT INTO goal (id, type, start_date, end_date) VALUES (${id}, 'maintain', '2026-01-01', NULL)`,
      );
    insert('a');
    expect(() => insert('b')).toThrow();
  });
});
