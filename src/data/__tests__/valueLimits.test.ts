/** @jest-environment node */
import { VALUE_LIMITS } from '../repositories';
import { expectDataError } from '../testing/expectations';
import { createHarness, type Harness } from '../testing/harness';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const item = (over: Record<string, unknown> = {}, nutrients: Record<string, number> = {}) => ({
  displayName: 'Estimated stew',
  grams: 300,
  foodSource: 'ai_estimate' as const,
  foodRef: null,
  origin: 'ai' as const,
  nutrients: { kcal: 400, protein: 20, carbs: 40, fat: 10, ...nutrients },
  ...over,
});
const meal = (items: ReturnType<typeof item>[]) => ({ eatenAt: new Date('2026-06-01T10:00:00Z'), timeZone: 'UTC', slot: 'lunch' as const, source: 'scan' as const, items });

describe('values are bounded where they enter, by the numbers the export format validates with', () => {
  it.each([
    ['weight', 12.5],
    ['weight', 900],
    ['waist', 5000],
    ['hips', 3],
    ['chest', 0.5],
    ['body_fat_pct', 95],
    ['body_fat_pct', 0.5],
  ] as const)('a %s of %s is refused when recorded, and nothing is stored', async (kind, value) => {
    await expectDataError(h.repos.measurements.record({ measuredOn: '2026-06-01', kind, value }), 'invalid_input');
    expect(await h.repos.measurements.list(kind)).toEqual([]);
  });

  it('is refused for a Health Connect reading too, and when an entry is edited', async () => {
    await expectDataError(h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value: 12.5, source: 'health_connect' }), 'invalid_input');
    const ok = await h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value: 70 });
    await expectDataError(h.repos.measurements.update(ok.id, { value: 12.5 }), 'invalid_input');
    expect((await h.repos.measurements.list('weight'))[0]!.value).toBe(70);
  });

  it('accepts the edges of the ranges', async () => {
    await h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value: VALUE_LIMITS.measurement.weight.min });
    await h.repos.measurements.record({ measuredOn: '2026-06-02', kind: 'weight', value: VALUE_LIMITS.measurement.weight.max });
    await h.repos.measurements.record({ measuredOn: '2026-06-03', kind: 'body_fat_pct', value: VALUE_LIMITS.measurement.body_fat_pct.max });
  });

  it('refuses an item whose grams, calories, macros or nutrients no portion could produce (AI estimates included)', async () => {
    await expectDataError(h.repos.meals.save(meal([item({ grams: 6000 })])), 'invalid_input');
    await expectDataError(h.repos.meals.save(meal([item({}, { kcal: 60_000 })])), 'invalid_input');
    await expectDataError(h.repos.meals.save(meal([item({}, { protein: 6000 })])), 'invalid_input');
    await expectDataError(h.repos.meals.save(meal([item({}, { sodium: 2e6 })])), 'invalid_input');
    expect((await h.repos.meals.totalsByDay('2026-06-01', '2026-06-01'))).toEqual([]);
  });

  it('accepts the largest portion of the densest food', async () => {
    await h.repos.meals.save(meal([item({ grams: 5000 }, { kcal: 50_000, protein: 5000, carbs: 5000, fat: 5000 })]));
  });

  it('refuses grams above the portion limit when an item is edited', async () => {
    const saved = await h.repos.meals.save(meal([item()]));
    await expectDataError(h.repos.meals.updateItemGrams(saved.items[0]!.id, 9000), 'invalid_input');
    expect((await h.repos.meals.getMeal(saved.id))!.items[0]!.grams).toBe(300);
  });

  it('bounds custom foods per 100 g, targets and the profile height', async () => {
    await expectDataError(h.repos.customFoods.create({ name: 'Rocket fuel', kcal100g: 5000, protein100g: 1, carbs100g: 1, fat100g: 1 }), 'invalid_input');
    await expectDataError(h.repos.customFoods.create({ name: 'Pure protein', kcal100g: 400, protein100g: 150, carbs100g: 1, fat100g: 1 }), 'invalid_input');
    await expectDataError(h.repos.goals.set({ type: 'maintain', startDate: '2026-06-01', kcalTarget: 99_999 }), 'invalid_input');
    await expectDataError(h.repos.goals.set({ type: 'maintain', startDate: '2026-06-01', basisWeightKg: 1e6 }), 'invalid_input');
    await expectDataError(
      h.repos.profile.save({ unitSystem: 'metric', locale: 'en', heightCm: 10_000, disclaimerAcceptedAt: '2026-06-01T00:00:00.000Z', disclaimerVersion: 'v' }),
      'invalid_input',
    );
  });
});
