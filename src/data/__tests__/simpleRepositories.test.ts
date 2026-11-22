/** @jest-environment node */
import { expectDataError } from '../testing/expectations';
import { createHarness, type Harness } from '../testing/harness';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

describe('ProfileRepository', () => {
  const base = {
    unitSystem: 'metric',
    locale: 'es',
    disclaimerAcceptedAt: '2026-06-15T12:00:00.000Z',
    disclaimerVersion: '1',
  } as const;

  it('is empty at first, then holds a single row that save() updates', async () => {
    const { profile } = h.repos;
    expect(await profile.get()).toBeNull();
    const created = await profile.save({ ...base, sex: 'female', birthDate: '1990-04-02', heightCm: 165, activityLevel: 'light' });
    expect(created).toMatchObject({ sex: 'female', heightCm: 165, createdAt: '2026-06-15T12:00:00.000Z' });

    h.setNow('2026-06-20T09:00:00.000Z');
    const updated = await profile.save({ ...base, sex: 'female', heightCm: 166, locale: 'en' });
    expect(updated).toMatchObject({ id: created.id, heightCm: 166, locale: 'en', birthDate: null, activityLevel: null, createdAt: created.createdAt, updatedAt: '2026-06-20T09:00:00.000Z' });
    expect(await profile.get()).toEqual(updated);
  });

  it('stores the special condition that disables target proposals', async () => {
    const p = await h.repos.profile.save({ ...base, specialCondition: 'pregnant' });
    expect(p.specialCondition).toBe('pregnant');
  });

  it('rejects a value outside the allowed set', async () => {
    await expect(h.repos.profile.save({ ...base, sex: 'other' as never })).rejects.toThrow();
    expect(await h.repos.profile.get()).toBeNull();
  });
});

describe('CustomFoodRepository', () => {
  const rice = { name: 'Arroz casero', kcal100g: 130, protein100g: 2.7, carbs100g: 28, fat100g: 0.3 };

  it('creates, reads, updates, lists and deletes', async () => {
    const { customFoods } = h.repos;
    const a = await customFoods.create({ ...rice, defaultPortionG: 180, otherNutrients: { fiber: 0.4 } });
    await customFoods.create({ ...rice, name: 'Bizcocho' });
    expect(await customFoods.get(a.id)).toEqual(a);
    expect(a.otherNutrients).toEqual({ fiber: 0.4 });

    const updated = await customFoods.update(a.id, { kcal100g: 140, otherNutrients: null });
    expect(updated).toMatchObject({ kcal100g: 140, name: 'Arroz casero', otherNutrients: null, defaultPortionG: 180 });

    expect((await customFoods.list()).map((f) => f.name)).toEqual(['Arroz casero', 'Bizcocho']);
    expect((await customFoods.list({ query: 'bizc' })).map((f) => f.name)).toEqual(['Bizcocho']);

    await customFoods.delete(a.id);
    expect(await customFoods.get(a.id)).toBeNull();
    await expectDataError(customFoods.update(a.id, { name: 'x' }), 'not_found');
  });

  it('exposes per-100 g nutrients in the shape core/nutrition reads', async () => {
    const f = await h.repos.customFoods.create({ ...rice, otherNutrients: { fiber: 0.4, sodium: 5 } });
    expect(f.per100g).toEqual({ kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sodium: 5 });
  });

  it('refuses negative or non-finite values and unknown nutrient codes', async () => {
    const { customFoods } = h.repos;
    await expectDataError(customFoods.create({ ...rice, kcal100g: -1 }), 'invalid_input');
    await expectDataError(customFoods.create({ ...rice, fat100g: Number.NaN }), 'invalid_input');
    await expectDataError(customFoods.create({ ...rice, name: '  ' }), 'invalid_input');
    await expectDataError(customFoods.create({ ...rice, otherNutrients: { bogus: 1 } as never }), 'invalid_input');
  });
});

describe('FoodUsageRepository', () => {
  const banana = { source: 'catalog', id: '1001' } as const;
  const rice = { source: 'catalog', id: '1002' } as const;

  it('keeps recents newest first with a use count and the last grams', async () => {
    const { foodUsage } = h.repos;
    h.setNow('2026-06-15T10:00:00.000Z');
    await foodUsage.recordUse(banana, 100);
    h.setNow('2026-06-15T11:00:00.000Z');
    await foodUsage.recordUse(rice, 200);
    h.setNow('2026-06-15T12:00:00.000Z');
    await foodUsage.recordUse(banana, 120);

    const recents = await foodUsage.recents(10);
    expect(recents.map((r) => [r.foodRef, r.useCount, r.lastGrams])).toEqual([
      ['1001', 2, 120],
      ['1002', 1, 200],
    ]);
    expect(await foodUsage.recents(1)).toHaveLength(1);
  });

  it('toggles favorites, also for a food never used', async () => {
    const { foodUsage } = h.repos;
    await foodUsage.setFavorite(banana, true);
    await foodUsage.recordUse(rice, 100);
    expect((await foodUsage.favorites()).map((f) => f.foodRef)).toEqual(['1001']);
    expect((await foodUsage.favorites())[0]?.useCount).toBe(0);

    await foodUsage.recordUse(banana, 100); // keeps the favorite flag
    expect((await foodUsage.favorites())[0]).toMatchObject({ foodRef: '1001', useCount: 1, isFavorite: true });

    await foodUsage.setFavorite(banana, false);
    expect(await foodUsage.favorites()).toEqual([]);
  });

  it('does not list favorites-only foods that were never used as recents', async () => {
    await h.repos.foodUsage.setFavorite(banana, true);
    expect(await h.repos.foodUsage.recents(10)).toEqual([]);
  });
});

describe('SettingsRepository', () => {
  it('stores, overwrites, reads all and removes keys', async () => {
    const { settings } = h.repos;
    expect(await settings.get('theme')).toBeNull();
    await settings.set('theme', 'dark');
    await settings.set('keep_photos', 'true');
    await settings.set('theme', 'light');
    expect(await settings.get('theme')).toBe('light');
    expect(await settings.getAll()).toEqual({ theme: 'light', keep_photos: 'true' });
    await settings.remove('theme');
    expect(await settings.get('theme')).toBeNull();
    await settings.remove('theme'); // removing a missing key is fine
  });
});
