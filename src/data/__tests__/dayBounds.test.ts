import { createHarness, type Harness } from '../testing/harness';
import { EARLIEST_DAY, FUTURE_SLACK_DAYS, dayBounds, isDayInBounds } from '../dayBounds';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
  h.setDayClock('2026-06-15T12:00:00.000Z');
});
afterEach(() => h.close());

const meal = (eatenAt: string) => ({
  eatenAt: new Date(eatenAt),
  timeZone: 'UTC',
  slot: 'lunch' as const,
  source: 'manual' as const,
  items: [{ displayName: 'Rice', grams: 100, foodSource: 'ai_estimate' as const, foodRef: null, origin: 'manual' as const, nutrients: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } }],
});

describe('one definition of which days may be stored (the export format uses it too)', () => {
  it('runs from 2000-01-01 to two days after the device date', () => {
    expect(dayBounds(new Date('2026-06-15T12:00:00.000Z'))).toEqual({ earliest: EARLIEST_DAY, latest: '2026-06-17' });
    expect(FUTURE_SLACK_DAYS).toBe(2);
    expect(isDayInBounds('2026-06-17', new Date('2026-06-15T12:00:00.000Z'))).toBe(true);
    expect(isDayInBounds('2026-06-18', new Date('2026-06-15T12:00:00.000Z'))).toBe(false);
    expect(isDayInBounds('1999-12-31', new Date('2026-06-15T12:00:00.000Z'))).toBe(false);
  });
});

describe('a date is bounded where it enters, with the same limits the export checks', () => {
  it('refuses a meal dated far in the future or before 2000, and stores nothing', async () => {
    await expect(h.repos.meals.save(meal('2031-03-04T10:00:00.000Z'))).rejects.toMatchObject({ code: 'date_out_of_range' });
    await expect(h.repos.meals.save(meal('1970-01-01T00:00:00.000Z'))).rejects.toMatchObject({ code: 'date_out_of_range' });
    expect(await h.repos.meals.listIds()).toEqual([]);
  });

  it('accepts a meal from today and one two days ahead (time zones, a clock a little off)', async () => {
    await expect(h.repos.meals.save(meal('2026-06-15T10:00:00.000Z'))).resolves.toBeDefined();
    await expect(h.repos.meals.save(meal('2026-06-17T10:00:00.000Z'))).resolves.toBeDefined();
  });

  it('refuses a measurement outside the range, on record and on update', async () => {
    await expect(h.repos.measurements.record({ measuredOn: '2031-03-04', kind: 'weight', value: 70 })).rejects.toMatchObject({ code: 'date_out_of_range' });
    const ok = await h.repos.measurements.record({ measuredOn: '2026-06-10', kind: 'weight', value: 70 });
    await expect(h.repos.measurements.update(ok.id, { measuredOn: '1999-01-01' })).rejects.toMatchObject({ code: 'date_out_of_range' });
    expect((await h.repos.measurements.list('weight')).map((m) => m.measuredOn)).toEqual(['2026-06-10']);
  });

  it('refuses a goal that starts outside the range; restoring a stored meal is not an entry and is allowed', async () => {
    await expect(
      h.repos.goals.set({ type: 'maintain', startDate: '2031-01-01', kcalTarget: 2000, proteinGTarget: 100, carbsGTarget: 250, fatGTarget: 67, isCustom: false }),
    ).rejects.toMatchObject({ code: 'date_out_of_range' });
    const saved = await h.repos.meals.save(meal('2026-06-15T10:00:00.000Z'));
    await h.repos.meals.deleteMeal(saved.id);
    await expect(h.repos.meals.restoreMeal({ ...saved, localDate: '2031-06-15' })).resolves.toMatchObject({ localDate: '2031-06-15' });
  });

  it('says that the phone’s date may be wrong when the clock itself is out of range', async () => {
    h.setDayClock('1970-01-01T00:00:00.000Z');
    const error = await h.repos.meals.save(meal('1970-01-01T00:00:00.000Z')).catch((e) => e);
    expect(error).toMatchObject({ code: 'date_out_of_range', deviceDateLooksWrong: true });
  });
});
