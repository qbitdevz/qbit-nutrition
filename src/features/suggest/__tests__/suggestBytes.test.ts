/** @jest-environment node */
import { MIN_REMAINING_KCAL_FOR_SUGGESTIONS } from '@/core/ai';
import { anthropicText, fakeFetch, geminiText, openaiText, res } from '@/core/ai/__fixtures__/fixtures';
import { createHarness, type Harness } from '@/data/testing/harness';
import { createTestServices } from '../../testing/testServices';
import { loadToday } from '../../today/loadToday';
import { suggestAvailability } from '../suggestInput';

const NOW = new Date(2026, 10, 21, 17, 5);
const KEYS = { openai_compatible: 'sk-OPENAI-SECRET-0123456789abcdef', anthropic: 'sk-ant-SECRET-0123456789abcdef', gemini: 'AIzaSECRET0123456789abcdefABCDEF' } as const;

/** Things from the day and the person that must never reach a provider: each is distinctive, so a leak is found by a plain search. */
const SENTINELS = [
  'ZEBRA-BREAKFAST-NAME',
  'ZEBRA-ITEM-NAME',
  'ZEBRA-MEAL-NOTE',
  'photos/ZEBRA-PHOTO.jpg',
  '1987-03-14', // birth date
  '171.73', // height
  '83.37', // weight
  'ZEBRA-CUSTOM-FOOD',
  'ZEBRA-PROVIDER-LABEL',
  '1432.5', // what was eaten, unrounded
  '2021.5', // the target, unrounded
  '2026-11-21T', // any timestamp of the day
  'prof-ZEBRA', // ids
];

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

async function seedDay() {
  const { repos } = h;
  await repos.profile.save({ sex: 'female', birthDate: '1987-03-14', heightCm: 171.73, activityLevel: 'active', unitSystem: 'metric', locale: 'es', disclaimerAcceptedAt: '2026-01-02T10:00:00.000Z', disclaimerVersion: 'v1' });
  await repos.goals.set({ type: 'lose_fat', pace: 'gentle', startDate: '2026-01-01', kcalTarget: 2021.5, proteinGTarget: 140.4, carbsGTarget: 200.5, fatGTarget: 60.2, isCustom: false, basisWeightKg: 83.37 });
  await repos.measurements.record({ measuredOn: '2026-11-21', kind: 'weight', value: 83.37 });
  const custom = await repos.customFoods.create({ name: 'ZEBRA-CUSTOM-FOOD', kcal100g: 100, protein100g: 5, carbs100g: 10, fat100g: 3 });
  await repos.meals.save({
    eatenAt: new Date(2026, 10, 21, 8, 30),
    slot: 'breakfast',
    name: 'ZEBRA-BREAKFAST-NAME',
    note: 'ZEBRA-MEAL-NOTE',
    photoPath: 'photos/ZEBRA-PHOTO.jpg',
    source: 'manual',
    items: [{ displayName: 'ZEBRA-ITEM-NAME', grams: 317.31, foodSource: 'custom', foodRef: custom.id, origin: 'manual', nutrients: { kcal: 1432.5, protein: 70.2, carbs: 120.3, fat: 45.1, sodium: 812.4 } }],
  });
}

async function provider(services: ReturnType<typeof createTestServices>, adapter: keyof typeof KEYS, baseUrl: string) {
  const created = await h.repos.aiProviders.create({ label: 'ZEBRA-PROVIDER-LABEL', preset: null, adapter, baseUrl, model: 'test-model', timeoutS: 30 });
  await services.secrets.set(created.id, KEYS[adapter]);
}

const CASES = [
  ['openai_compatible', 'https://llm.example.test/v1', res(200, openaiText(JSON.stringify({ suggestions: [] })))],
  ['anthropic', 'https://claude.example.test', res(200, anthropicText(JSON.stringify({ suggestions: [] })))],
  ['gemini', 'https://gem.example.test', res(200, geminiText(JSON.stringify({ suggestions: [] })))],
] as const;

describe('S6, S9: a food-suggestion request carries only the remaining numbers, the goal type and the locale', () => {
  it.each(CASES)('%s: the exact bytes sent hold no other field of the day', async (adapter, baseUrl, answer) => {
    await seedDay();
    const fetch = fakeFetch(answer);
    const services = createTestServices(h, { fetch: fetch.fetch });
    await provider(services, adapter, baseUrl);

    const day = await loadToday({ repos: h.repos, localDate: '2026-11-21', now: NOW });
    const availability = suggestAvailability(day);
    expect(availability.kind).toBe('ready');
    if (availability.kind !== 'ready') return;
    // What is left: the targets minus what was eaten (2021.5 - 1432.5 = 589 kcal; 140.4 - 70.2 = 70.2 g protein...).
    expect(availability.remaining).toEqual({ kcal: 589, proteinG: 70.2, carbsG: 80.2, fatG: 15.1 });
    expect(availability.goal).toBe('lose_fat');

    const out = await services.scan.suggest({ remaining: availability.remaining, goal: availability.goal, locale: 'es', signal: new AbortController().signal });
    expect(out.suggestions).toEqual([]);

    expect(fetch.calls).toHaveLength(1);
    const call = fetch.calls[0]!;
    const body = call.rawBody!;
    // The user message, byte for byte: rounded numbers, the goal type, the locale.
    expect(body).toContain('{\\"remaining\\":{\\"kcal\\":589,\\"protein_g\\":70,\\"carbs_g\\":80,\\"fat_g\\":15},\\"goal\\":\\"lose_fat\\",\\"locale\\":\\"es\\"}');
    for (const sentinel of SENTINELS) {
      expect(body).not.toContain(sentinel);
      expect(call.url).not.toContain(sentinel);
    }
    // No key in the body, no photo, no profile words.
    for (const key of Object.values(KEYS)) expect(body).not.toContain(key);
    for (const word of ['image', 'inlineData', 'base64', 'birth', 'height', 'activity', 'disclaimer', 'photo', 'slot', 'eaten']) {
      expect(body.toLowerCase()).not.toContain(word);
    }
    // The key is in a header, as for a scan, and nowhere in the URL.
    expect(JSON.stringify(call.headers)).toContain(KEYS[adapter]);
    expect(call.url).not.toContain(KEYS[adapter]);
  });

  it('is exactly the same request whatever else is in the day (more meals, other notes): only the remaining numbers change it', async () => {
    const run = async (extra: boolean) => {
      const harness = await createHarness();
      try {
        await harness.repos.goals.set({ type: 'maintain', startDate: '2026-01-01', kcalTarget: 2000, proteinGTarget: 100, carbsGTarget: 250, fatGTarget: 67, isCustom: false });
        const meal = (name: string, nutrients: { kcal: number; protein: number; carbs: number; fat: number }) =>
          harness.repos.meals.save({ eatenAt: new Date(2026, 10, 21, 9, 0), slot: 'breakfast', name, note: `note for ${name}`, source: 'manual', items: [{ displayName: name, grams: 100, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients }] });
        await meal(extra ? 'Eggs and toast' : 'Porridge', { kcal: 500, protein: 10, carbs: 20, fat: 5 });
        if (extra) await meal('Black coffee', { kcal: 0, protein: 0, carbs: 0, fat: 0 }); // an extra meal that adds nothing to the totals
        const fetch = fakeFetch(res(200, openaiText(JSON.stringify({ suggestions: [] }))));
        const services = createTestServices(harness, { fetch: fetch.fetch });
        await harness.repos.aiProviders.create({ label: extra ? 'One' : 'Another', preset: null, adapter: 'openai_compatible', baseUrl: 'https://llm.example.test/v1', model: 'm', timeoutS: 30 }).then((p) => services.secrets.set(p.id, 'k'));
        const day = await loadToday({ repos: harness.repos, localDate: '2026-11-21', now: NOW });
        const availability = suggestAvailability(day);
        if (availability.kind !== 'ready') throw new Error('expected a day to suggest for');
        await services.scan.suggest({ remaining: availability.remaining, goal: availability.goal, locale: 'en', signal: new AbortController().signal });
        services.close();
        return fetch.calls[0]!.rawBody;
      } finally {
        harness.close();
      }
    };
    expect(await run(true)).toBe(await run(false));
  });
});

describe('suggestAvailability: when the provider is not called', () => {
  const base = { isToday: true, totals: { kcal: 1800, proteinG: 90, carbsG: 200, fatG: 60 }, targets: { kcal: 2000, proteinG: 100, carbsG: 250, fatG: 67 }, goalType: 'maintain' as const };

  it('is ready with what is left, never negative', () => {
    expect(suggestAvailability(base)).toEqual({ kind: 'ready', goal: 'maintain', remaining: { kcal: 200, proteinG: 10, carbsG: 50, fatG: 7 } });
    expect(suggestAvailability({ ...base, totals: { kcal: 1800, proteinG: 130, carbsG: 200, fatG: 60 } })).toMatchObject({ kind: 'ready', remaining: { proteinG: 0 } });
  });

  it('says there is nothing left at or below the threshold: no request', () => {
    expect(suggestAvailability({ ...base, totals: { ...base.totals, kcal: 2000 - MIN_REMAINING_KCAL_FOR_SUGGESTIONS + 1 } })).toEqual({ kind: 'nothing_left' });
    expect(suggestAvailability({ ...base, totals: { ...base.totals, kcal: 2000 } })).toEqual({ kind: 'nothing_left' });
    expect(suggestAvailability({ ...base, totals: { ...base.totals, kcal: 2600 } })).toEqual({ kind: 'nothing_left' });
    expect(suggestAvailability({ ...base, totals: { ...base.totals, kcal: 2000 - MIN_REMAINING_KCAL_FOR_SUGGESTIONS } })).toMatchObject({ kind: 'ready' });
  });

  it('needs a calorie target and a goal', () => {
    expect(suggestAvailability({ ...base, targets: { ...base.targets, kcal: null } })).toEqual({ kind: 'no_targets' });
    expect(suggestAvailability({ ...base, goalType: null })).toEqual({ kind: 'no_targets' });
  });

  it('sends null for a macro without a target instead of a made-up number', () => {
    expect(suggestAvailability({ ...base, targets: { ...base.targets, proteinG: null } })).toMatchObject({ kind: 'ready', remaining: { proteinG: null, carbsG: 50 } });
  });

  it('offers nothing for a past day', () => {
    expect(suggestAvailability({ ...base, isToday: false })).toEqual({ kind: 'not_today' });
  });
});
