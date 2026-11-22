/** @jest-environment node */
import { TEXT_LIMITS } from '../repositories';
import { expectDataError } from '../testing/expectations';
import { createHarness, type Harness } from '../testing/harness';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const text = (n: number) => 'x'.repeat(n);
const item = (displayName: string) => ({ displayName, grams: 10, foodSource: 'ai_estimate' as const, foodRef: null, origin: 'manual' as const, nutrients: { kcal: 1, protein: 0, carbs: 0, fat: 0 } });
const meal = (over: object) => ({ eatenAt: new Date('2026-06-01T10:00:00Z'), timeZone: 'UTC', slot: 'lunch' as const, source: 'manual' as const, items: [item('Soup')], ...over });
const provider = (over: object) => ({ label: 'P', preset: null, adapter: 'gemini' as const, baseUrl: 'https://x.example.com', model: 'm', timeoutS: 30, ...over });

describe('what the app stores agrees with what the export format allows, so an export never fails on a value the app accepted', () => {
  it('custom food names', async () => {
    await expect(h.repos.customFoods.create({ name: text(TEXT_LIMITS.name), kcal100g: 1, protein100g: 1, carbs100g: 1, fat100g: 1 })).resolves.toBeDefined();
    await expectDataError(h.repos.customFoods.create({ name: text(TEXT_LIMITS.name + 1), kcal100g: 1, protein100g: 1, carbs100g: 1, fat100g: 1 }), 'invalid_input');
    const c = await h.repos.customFoods.create({ name: 'ok', kcal100g: 1, protein100g: 1, carbs100g: 1, fat100g: 1 });
    await expectDataError(h.repos.customFoods.update(c.id, { name: text(TEXT_LIMITS.name + 1) }), 'invalid_input');
  });

  it('provider label, model and base URL', async () => {
    await expect(h.repos.aiProviders.create(provider({ label: text(TEXT_LIMITS.label), model: text(TEXT_LIMITS.model) }))).resolves.toBeDefined();
    await expectDataError(h.repos.aiProviders.create(provider({ label: text(TEXT_LIMITS.label + 1) })), 'invalid_input');
    await expectDataError(h.repos.aiProviders.create(provider({ model: text(TEXT_LIMITS.model + 1) })), 'invalid_input');
    await expectDataError(h.repos.aiProviders.create(provider({ baseUrl: `https://x.example.com/${text(TEXT_LIMITS.url)}` })), 'invalid_input');
  });

  it('meal name, note and item names', async () => {
    await expect(h.repos.meals.save(meal({ name: text(TEXT_LIMITS.mealName), note: text(TEXT_LIMITS.note) }))).resolves.toBeDefined();
    await expectDataError(h.repos.meals.save(meal({ name: text(TEXT_LIMITS.mealName + 1) })), 'invalid_input');
    await expectDataError(h.repos.meals.save(meal({ note: text(TEXT_LIMITS.note + 1) })), 'invalid_input');
    await expectDataError(h.repos.meals.save(meal({ items: [item(text(TEXT_LIMITS.name + 1))] })), 'invalid_input');
  });

  it('meal photo paths: a repository only stores a photo path of the kind the export format accepts', async () => {
    await expectDataError(h.repos.meals.save(meal({ photoPath: '../x.jpg' })), 'invalid_input');
    await expect(h.repos.meals.save(meal({ photoPath: 'photos/a-b_c.jpg' }))).resolves.toBeDefined();
  });

  it('lists the photo paths in use', async () => {
    await h.repos.meals.save(meal({ photoPath: 'photos/a.jpg' }));
    await h.repos.meals.save(meal({ photoPath: 'photos/a.jpg' }));
    await h.repos.meals.save(meal({ photoPath: 'photos/b.jpg' }));
    await h.repos.meals.save(meal({}));
    expect((await h.repos.meals.photoPaths()).sort()).toEqual(['photos/a.jpg', 'photos/b.jpg']);
  });
});
