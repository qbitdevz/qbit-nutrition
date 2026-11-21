import type { FetchLike, HttpResponse } from '@/core/ai/types';

/**
 * DEVELOPMENT ONLY (QN_DEV_ONLY_FAKE_PROVIDER). A fake AI provider for the browser preview, so the
 * review and every failure screen can be looked at without a key or a network. Nothing in the app
 * imports this module except behind `__DEV__`, so release bundles do not contain it.
 */

export const DEV_SCENARIOS = ['success', 'hang', 'no_network', 'invalid_key', 'quota', 'no_vision', 'invalid_output', 'no_food', 'unknown'] as const;
export type DevScenario = (typeof DEV_SCENARIOS)[number];

/** A string no release bundle may contain: the build check looks for it. */
export const DEV_MARKER = 'QN_DEV_ONLY_FAKE_PROVIDER';

export const DEV_PROVIDER_URL = 'https://fake-provider.example.test/v1';
export const DEV_PLACEHOLDER_KEY = 'dev-placeholder-not-a-real-key';

let scenario: DevScenario = 'success';
export const getDevScenario = (): DevScenario => scenario;
export const setDevScenario = (next: DevScenario): void => {
  scenario = next;
};

function reply(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, text: async () => text };
}

const completion = (content: string) => ({
  id: DEV_MARKER,
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
  usage: { prompt_tokens: 700, completion_tokens: 220 },
});

function item(name: string, canonical: string, terms: string[], preparation: string, grams: number, food: string, portion: string, per100: [number, number, number, number]) {
  return {
    name,
    canonical_name_en: canonical,
    search_terms_en: terms,
    preparation,
    grams,
    portion_basis: 'about the size of a palm',
    confidence_food: food,
    confidence_portion: portion,
    fallback_per_100g: { kcal: per100[0], protein_g: per100[1], carbs_g: per100[2], fat_g: per100[3] },
  };
}

function scanResult(spanish: boolean) {
  return {
    is_food: true,
    dish_name: spanish ? 'Arroz con brócoli y albóndigas' : 'Rice with broccoli and meat patties',
    items: [
      item(spanish ? 'Arroz blanco' : 'White rice', 'rice, white, long-grain, cooked', ['white rice'], 'boiled', 150, 'high', 'low', [130, 2.7, 28, 0.3]),
      item(spanish ? 'Brócoli' : 'Broccoli', 'broccoli, cooked, boiled', ['broccoli'], 'steamed', 60, 'low', 'medium', [35, 2.4, 7.2, 0.4]),
      item(spanish ? 'Albóndigas de carne' : 'Meat patties', 'zzz meat patty', ['zzz patty'], 'fried', 120, 'medium', 'medium', [250, 17, 8, 17]),
      item(spanish ? 'Zanahoria' : 'Carrot slices', 'carrots, cooked, boiled', ['carrot'], 'boiled', 40, 'high', 'high', [35, 0.8, 8.2, 0.2]),
    ],
    hidden_ingredients_note: 'likely cooked with a little oil',
  };
}

/** What the fake provider answers a food-suggestion request with (the request names its schema `food_suggestions`). */
function suggestionsResult(spanish: boolean) {
  const s = (name: string, grams: number, kcal: number, protein: number, carbs: number, fat: number, reason: string) => ({ name, grams, kcal, protein_g: protein, carbs_g: carbs, fat_g: fat, reason });
  return {
    suggestions: spanish
      ? [
          s('Yogur griego con frutos rojos', 200, 150, 18, 14, 2.5, 'Aporta proteína que todavía te queda por hoy.'),
          s('Pechuga de pollo a la plancha', 120, 198, 37, 0, 4.3, 'Mucha proteína con pocas calorías.'),
          s('Manzana con crema de cacahuate', 190, 230, 5, 33, 9, 'Suma carbohidratos y algo de grasa para llegar a tu objetivo.'),
        ]
      : [
          s('Greek yogurt with berries', 200, 150, 18, 14, 2.5, 'Adds protein you still have left today.'),
          s('Grilled chicken breast', 120, 198, 37, 0, 4.3, 'A lot of protein for few calories.'),
          s('Apple with peanut butter', 190, 230, 5, 33, 9, 'Adds carbs and some fat toward your target.'),
        ],
  };
}

/** The fetch the preview hands to the AI client: it answers according to the scenario picked in the dev panel. */
export const devFetch: FetchLike = async (_url, init) => {
  switch (scenario) {
    case 'no_network':
      throw new Error('Network request failed');
    case 'hang':
      return new Promise<HttpResponse>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    case 'invalid_key':
      return reply(401, { error: { message: 'Incorrect API key provided.' } });
    case 'quota':
      return reply(429, { error: { message: 'Rate limit reached.' } }, { 'retry-after': '7800' });
    case 'no_vision':
      return reply(400, { error: { message: 'This model does not support image input.' } });
    case 'invalid_output':
      return reply(200, completion('Sorry, here is a description of your meal instead of JSON.'));
    case 'no_food':
      return reply(200, completion(JSON.stringify({ is_food: false, dish_name: '', items: [], hidden_ingredients_note: '' })));
    case 'unknown':
      return reply(418, { error: { message: 'teapot' } });
    default: {
      const body = String(init.body ?? '');
      if (body.includes('food_suggestions')) return reply(200, completion(JSON.stringify(suggestionsResult(body.includes('locale\\":\\"es') || body.includes('Spanish (es)')))));
      return reply(200, completion(JSON.stringify(scanResult(body.includes('Spanish (es)')))));
    }
  }
};
