/** @jest-environment node */
import { GoalConflictError } from '../repositories/goals';
import { createHarness, type Harness } from '../testing/harness';

/**
 * Setting a goal never deletes a stored goal by itself (patch 1.0.1, S10). An open goal that starts on or before the new goal's start is
 * closed the day before, whatever its date. One that starts later is a conflict: refused, or, when it starts beyond the latest day the app
 * accepts today, replaced only when the caller names it (the person confirmed).
 */
let h: Harness;
beforeEach(async () => {
  h = await createHarness();
  h.setDayClock('2026-06-15T12:00:00.000Z');
});
afterEach(() => h.close());

const NEW = { type: 'maintain', kcalTarget: 1900, proteinGTarget: 100, carbsGTarget: 200, fatGTarget: 60 } as const;
const insert = (id: string, start: string, end: string | null, kcal = 2000) =>
  h.client.exec(`INSERT INTO goal (id, type, start_date, end_date, kcal_target, is_custom) VALUES ('${id}', 'maintain', '${start}', ${end ? `'${end}'` : 'NULL'}, ${kcal}, 0)`);
const shape = async () => (await h.repos.goals.history()).map((g) => [g.id, g.startDate, g.endDate]);

/** No two periods share a day, and only the latest one is open. */
async function expectCleanHistory() {
  const history = await h.repos.goals.history();
  history.forEach((g, i) => {
    const next = history[i + 1];
    if (!next) return;
    expect(g.endDate).not.toBeNull();
    expect(g.endDate! < next.startDate).toBe(true);
  });
}

describe('F1 — a clock behind the open goal’s date', () => {
  it('does not delete the open goal; it refuses with a specific error and changes nothing', async () => {
    insert('legit', '2026-06-02', null);
    h.setDayClock('2024-03-01T12:00:00.000Z');
    const error = await h.repos.goals.set({ ...NEW, startDate: '2024-03-01' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoalConflictError);
    expect(error).toMatchObject({ code: 'goal_date_conflict', reason: 'open_starts_beyond_latest', canReplace: true, newStart: '2024-03-01' });
    expect((error as GoalConflictError).openGoal).toMatchObject({ id: 'legit', startDate: '2026-06-02', kcalTarget: 2000 });
    expect(await shape()).toEqual([['legit', '2026-06-02', null]]);
  });

  it('replaces it only when the caller names that exact goal, and reports what was replaced', async () => {
    insert('legit', '2026-06-02', null);
    h.setDayClock('2024-03-01T12:00:00.000Z');
    await expect(h.repos.goals.set({ ...NEW, startDate: '2024-03-01' }, { replaceGoalId: 'other' })).rejects.toBeInstanceOf(GoalConflictError);
    expect(await shape()).toEqual([['legit', '2026-06-02', null]]);
    const set = await h.repos.goals.set({ ...NEW, startDate: '2024-03-01' }, { replaceGoalId: 'legit' });
    expect(set.replaced).toMatchObject({ id: 'legit', startDate: '2026-06-02', kcalTarget: 2000 });
    expect((await shape()).map(([, s, e]) => [s, e])).toEqual([['2024-03-01', null]]);
  });

  it('refuses a replacement that would leave history overlapping, and deletes nothing', async () => {
    insert('past', '2026-01-01', '2026-06-01');
    insert('legit', '2026-06-02', null);
    h.setDayClock('2024-03-01T12:00:00.000Z');
    await expect(h.repos.goals.set({ ...NEW, startDate: '2024-03-01' }, { replaceGoalId: 'legit' })).rejects.toMatchObject({ code: 'goal_date_conflict', reason: 'history_overlap' });
    expect(await shape()).toEqual([['past', '2026-01-01', '2026-06-01'], ['legit', '2026-06-02', null]]);
  });

  it('a start inside the accepted slack is refused with no way to replace it', async () => {
    insert('legit', '2026-06-16', null); // the latest accepted day is 2026-06-17
    const error = (await h.repos.goals.set({ ...NEW, startDate: '2026-06-15' }, { replaceGoalId: 'legit' }).catch((e: unknown) => e)) as GoalConflictError;
    expect(error).toMatchObject({ reason: 'open_starts_later', canReplace: false });
    expect(await shape()).toEqual([['legit', '2026-06-16', null]]);
  });

  it('the boundary: a start on the latest accepted day is refused; one day beyond it can be replaced', async () => {
    insert('edge', '2026-06-17', null);
    await expect(h.repos.goals.set({ ...NEW, startDate: '2026-06-15' })).rejects.toMatchObject({ reason: 'open_starts_later', canReplace: false });
    h.client.exec(`UPDATE goal SET start_date = '2026-06-18'`);
    await expect(h.repos.goals.set({ ...NEW, startDate: '2026-06-15' })).rejects.toMatchObject({ reason: 'open_starts_beyond_latest', canReplace: true });
  });

  it('a clock ahead closes the open goal the day before, as usual', async () => {
    insert('legit', '2026-06-02', null);
    h.setDayClock('2030-01-01T12:00:00.000Z');
    await h.repos.goals.set({ ...NEW, startDate: '2030-01-01' });
    expect((await shape()).map(([id, s, e]) => [id === 'legit', s, e])).toEqual([[true, '2026-06-02', '2029-12-31'], [false, '2030-01-01', null]]);
    await expectCleanHistory();
  });
});

describe('F2 — an open goal that starts before 2000 is closed, never deleted', () => {
  it('keeps the targets of every past day it covered, through the read the Today screen uses', async () => {
    insert('old', '1970-01-01', null, 1750);
    await h.repos.goals.set({ ...NEW, startDate: '2026-06-15' });
    expect(await shape()).toEqual([['old', '1970-01-01', '2026-06-14'], [expect.any(String), '2026-06-15', null]]);
    expect((await h.repos.goals.on('1985-03-04'))?.kcalTarget).toBe(1750);
    expect((await h.repos.goals.on('2026-06-14'))?.kcalTarget).toBe(1750);
    expect((await h.repos.goals.on('2026-06-15'))?.kcalTarget).toBe(1900);
    await expectCleanHistory();
  });

  it('exactly 2000-01-01 and the day before it behave the same', async () => {
    for (const start of ['2000-01-01', '1999-12-31']) {
      h.client.exec('DELETE FROM goal');
      insert('edge', start, null);
      await h.repos.goals.set({ ...NEW, startDate: '2026-06-15' });
      expect((await h.repos.goals.history())[0]).toMatchObject({ id: 'edge', startDate: start, endDate: '2026-06-14' });
      await expectCleanHistory();
    }
  });
});

describe('the open goal against the new start', () => {
  it('starting the same day updates it in place; the day before closes it on its own first day; the day after is a conflict', async () => {
    insert('a', '2026-06-15', null);
    await h.repos.goals.set({ ...NEW, startDate: '2026-06-15' });
    expect(await shape()).toEqual([['a', '2026-06-15', null]]);
    expect((await h.repos.goals.current())?.kcalTarget).toBe(1900);

    h.client.exec('DELETE FROM goal');
    insert('b', '2026-06-14', null);
    await h.repos.goals.set({ ...NEW, startDate: '2026-06-15' });
    expect((await shape()).map(([, s, e]) => [s, e])).toEqual([['2026-06-14', '2026-06-14'], ['2026-06-15', null]]);
    await expectCleanHistory();

    h.client.exec('DELETE FROM goal');
    insert('c', '2026-06-16', null);
    await expect(h.repos.goals.set({ ...NEW, startDate: '2026-06-15' })).rejects.toMatchObject({ code: 'goal_date_conflict' });
    expect(await shape()).toEqual([['c', '2026-06-16', null]]);
  });

  it('with no open goal, a start that falls inside a closed period is refused', async () => {
    insert('closed', '2026-01-01', '2026-12-31');
    await expect(h.repos.goals.set({ ...NEW, startDate: '2026-06-15' })).rejects.toMatchObject({ reason: 'history_overlap' });
    expect(await shape()).toEqual([['closed', '2026-01-01', '2026-12-31']]);
  });

  it('a history already damaged by 1.0.0 does not lock the person out when the new start is clear of it', async () => {
    insert('a', '2024-03-01', null);
    insert('b', '2026-01-01', '2026-06-01');
    await h.repos.goals.set({ ...NEW, startDate: '2026-06-15' });
    expect((await h.repos.goals.current())?.startDate).toBe('2026-06-15');
  });
});
