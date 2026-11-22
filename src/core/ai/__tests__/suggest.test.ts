import { getAdapter } from '../adapters';
import {
  anthropicText,
  anthropicToolUse,
  fakeFetch,
  geminiText,
  noSleep,
  openaiText,
  profiles,
  res,
  type RecordedCall,
} from '../__fixtures__/fixtures';
import { ProviderError } from '../errors';
import {
  MAX_SUGGESTIONS,
  MIN_REMAINING_KCAL_FOR_SUGGESTIONS,
  NothingToSuggestError,
  SUGGEST_PROMPT_VERSION,
  SuggestionList,
  buildSuggestSystemPrompt,
  buildSuggestUserText,
  createVisionGateway,
  suggestFoods,
  suggestionsJsonSchema,
} from '..';
import type { ProviderProfile } from '../types';

const KEY = 'sk-SUGGEST-0123456789abcdefABCDEF';
const REMAINING = { kcal: 520, proteinG: 38, carbsG: 60, fatG: 14 };

const good = (over: object = {}) => ({
  name: 'Yogur griego natural',
  grams: 170,
  kcal: 100,
  protein_g: 17,
  carbs_g: 6,
  fat_g: 0.7,
  reason: 'Aporta la proteína que te queda.',
  ...over,
});
const list = (...items: object[]) => ({ suggestions: items.length > 0 ? items : [good()] });

type Fake = ReturnType<typeof fakeFetch>;
const deps = (fake: Fake) => ({ fetch: fake.fetch, sleep: noSleep });

function input(profile: ProviderProfile, over: object = {}) {
  return { profile, apiKey: KEY, remaining: REMAINING, goal: 'lose_fat' as const, locale: 'es' as const, signal: new AbortController().signal, ...over };
}

/** The reply each protocol gives for a JSON answer in a given output mode. */
function replyFor(profile: ProviderProfile, mode: string, answer: unknown) {
  const text = JSON.stringify(answer);
  switch (profile.adapter) {
    case 'openai_compatible':
      return mode === 'tool'
        ? { choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'record_food_suggestions', arguments: text } }] } }] }
        : openaiText(text);
    case 'anthropic':
      return mode === 'tool'
        ? { ...anthropicToolUse(answer), content: [{ type: 'tool_use', id: 'toolu_1', name: 'record_food_suggestions', input: answer }] }
        : anthropicText(text);
    case 'gemini':
      return geminiText(text);
  }
}

const adapterModes = (profile: ProviderProfile) => getAdapter(profile.adapter).supportedModes.map((mode) => [profile.adapter, mode, profile] as const);
const everyAdapterAndMode = Object.values(profiles).flatMap(adapterModes);

async function failureOf(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

/** Every string and number in a JSON value, with the path it was found at. */
function leaves(value: unknown, path = ''): [string, string | number][] {
  if (typeof value === 'string' || typeof value === 'number') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
  return [];
}

describe('suggestFoods: what is sent (S6, S9, docs/09 section 1.1, docs/07 section 8)', () => {
  it.each(everyAdapterAndMode)('%s in "%s" mode sends text only: the remaining numbers, the goal type and the locale, in the exact bytes', async (_adapter, mode, profile) => {
    const fake = fakeFetch(res(200, replyFor(profile, mode, list())));
    await suggestFoods(input({ ...profile, outputMode: mode }), deps(fake));
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0] as RecordedCall;
    const raw = call.rawBody!;

    // The one user message is exactly the numbers, the goal and the locale.
    const userText = '{"remaining":{"kcal":520,"protein_g":38,"carbs_g":60,"fat_g":14},"goal":"lose_fat","locale":"es"}';
    expect(buildSuggestUserText({ remaining: REMAINING, goal: 'lose_fat', locale: 'es' })).toBe(userText);
    expect(raw.split(JSON.stringify(userText).slice(1, -1))).toHaveLength(2); // present once, byte for byte

    // The system prompt carries no data of the day: it is the fixed text plus the language.
    const system = buildSuggestSystemPrompt({ locale: 'es' });
    expect(raw).toContain(JSON.stringify(system).slice(1, -1).slice(0, 200));

    // No photo, in any protocol's spelling.
    for (const forbidden of ['image', 'inlineData', 'base64', 'jpeg', 'jpg']) expect(raw.toLowerCase()).not.toContain(forbidden.toLowerCase());

    // The key travels in a header, never in the body.
    expect(raw).not.toContain(KEY);
    expect(JSON.stringify(call.headers)).toContain(KEY);

    // Every string that is not part of the schema or the prompt text is accounted for: model name, the roles, the user text.
    const strings = leaves(JSON.parse(raw)).map(([, v]) => v);
    expect(strings.filter((v) => typeof v === 'string' && /\d{4}-\d{2}-\d{2}|@|\.jpg|[0-9a-f]{8}-[0-9a-f]{4}/i.test(v))).toEqual([]);
  });

  it('describes the model task with the numbers of the contract only: the request type has no place for anything else', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON.stringify(list()))));
    // Extra fields a caller might try to pass are not read: only remaining, goal and locale reach the request.
    await suggestFoods(
      { ...input({ ...profiles.openai, outputMode: 'schema' }), meals: [{ name: 'LEAKED-MEAL' }], profileName: 'LEAKED-PERSON', birthDate: '1987-03-14', history: ['LEAKED-HISTORY'], eaten: { kcal: 1432.7 } } as never,
      deps(fake),
    );
    const raw = fake.calls[0]!.rawBody!;
    for (const leaked of ['LEAKED-MEAL', 'LEAKED-PERSON', '1987-03-14', 'LEAKED-HISTORY', '1432']) expect(raw).not.toContain(leaked);
  });

  it('rounds and bounds the numbers it sends, and sends null for a macro that has no target', () => {
    expect(buildSuggestUserText({ remaining: { kcal: 520.6, proteinG: -3, carbsG: 59.5, fatG: null }, goal: 'maintain', locale: 'en' })).toBe(
      '{"remaining":{"kcal":521,"protein_g":0,"carbs_g":60,"fat_g":null},"goal":"maintain","locale":"en"}',
    );
    expect(buildSuggestUserText({ remaining: { kcal: 1e9, proteinG: 1e9, carbsG: 1e9, fatG: 1e9 }, goal: 'maintain', locale: 'en' })).toContain('"kcal":10000');
  });

  it('keeps the same prompt version in the result and states the rules of docs/05 section 8 and docs/07 section 7 in the prompt', () => {
    const system = buildSuggestSystemPrompt({ locale: 'es' });
    expect(SUGGEST_PROMPT_VERSION).toBe(1);
    expect(system).toContain('Spanish (es)');
    expect(system).not.toContain('{locale}');
    for (const rule of [/no medical advice/i, /never suggest skipping meals/i, /no moral words/i, /only suggest foods to add/i, /plain text/i]) expect(system).toMatch(rule);
  });

  it('the prompt injection of the locale cannot be steered by special replacement patterns', () => {
    expect(buildSuggestSystemPrompt({ locale: 'en' })).toContain('English (en)');
  });
});

describe('suggestFoods: the result', () => {
  const openai = { ...profiles.openai, outputMode: 'schema' as const };

  it('returns the validated list with the metadata of the contract', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON.stringify(list(good(), good({ name: 'Manzana', grams: 180, kcal: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3, reason: 'Fruta con fibra.' }))))));
    const out = await suggestFoods(input(openai), deps(fake));
    expect(out.suggestions).toEqual([
      { name: 'Yogur griego natural', grams: 170, kcal: 100, proteinG: 17, carbsG: 6, fatG: 0.7, reason: 'Aporta la proteína que te queda.' },
      { name: 'Manzana', grams: 180, kcal: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, reason: 'Fruta con fibra.' },
    ]);
    expect(out).toMatchObject({ repaired: false, outputModeUsed: 'schema', promptVersion: 1, usage: { inputTokens: 812, outputTokens: 240 } });
  });

  it('a repaired answer whose calls did not both report tokens carries a partial figure, never a partial total (S7)', async () => {
    const usage = { prompt_tokens: 812, completion_tokens: 240 };
    for (const [first, second] of [[usage, false], [false, usage]] as const) {
      const fake = fakeFetch(res(200, openaiText('not json', first)), res(200, openaiText(JSON.stringify(list()), second)));
      const out = await suggestFoods(input(openai), deps(fake));
      expect(out.repaired).toBe(true);
      expect(out.usage).toBeUndefined();
      expect(out.usagePartial).toEqual({ inputTokens: 812, outputTokens: 240 });
    }
  });

  it('asks for the suggestions schema, not the scan schema, in the structured-output modes', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON.stringify(list()))));
    await suggestFoods(input(openai), deps(fake));
    expect(fake.calls[0]!.body!.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'food_suggestions', strict: true } });
    expect(JSON.stringify(fake.calls[0]!.body!.response_format)).toContain('protein_g');
    expect(JSON.stringify(fake.calls[0]!.body!.response_format)).not.toContain('canonical_name_en');

    const tool = fakeFetch(res(200, replyFor(profiles.openai, 'tool', list())));
    await suggestFoods(input({ ...profiles.openai, outputMode: 'tool' }), deps(tool));
    expect(tool.calls[0]!.body!.tool_choice).toEqual({ type: 'function', function: { name: 'record_food_suggestions' } });
  });

  it('is part of the gateway the app builds', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON.stringify(list()))));
    const gateway = createVisionGateway({ fetch: fake.fetch, sleep: noSleep });
    expect((await gateway.suggestFoods(input(openai))).suggestions).toHaveLength(1);
  });

  it('turns provider failures into the taxonomy of docs/09 section 1.2, untouched', async () => {
    for (const [answer, code] of [
      [res(401, { error: { message: 'Incorrect API key' } }), 'auth_invalid'],
      [res(429, { error: { message: 'rate limit' } }, { 'retry-after': '12' }), 'quota_exceeded'],
      [res(404, { error: { message: 'model not found' } }), 'model_not_found'],
    ] as const) {
      const error = await failureOf(suggestFoods(input(openai), deps(fakeFetch(answer))));
      expect(error).toBeInstanceOf(ProviderError);
      expect(error.code).toBe(code);
    }
  });
});

describe('suggestFoods: untrusted output', () => {
  const openai = { ...profiles.openai, outputMode: 'schema' as const };
  const run = (...replies: unknown[]) => {
    const fake = fakeFetch(...replies.map((r) => res(200, openaiText(typeof r === 'string' ? r : JSON.stringify(r)))));
    return { fake, result: suggestFoods(input(openai), deps(fake)) };
  };

  it('repairs once: the second request carries the previous output and what was wrong; the result says it was repaired', async () => {
    const { fake, result } = run('Sorry, here are some ideas: yogurt, apple.', list());
    const out = await result;
    expect(out.repaired).toBe(true);
    expect(fake.calls).toHaveLength(2);
    const second = JSON.stringify(fake.calls[1]!.body);
    expect(second).toContain('Sorry, here are some ideas');
    expect(second).toContain('did not pass validation');
  });

  it('accepts JSON in a code fence or with prose around it', async () => {
    const { result } = run('Here you go:\n```json\n' + JSON.stringify(list()) + '\n```');
    expect((await result).suggestions).toHaveLength(1);
  });

  it('fails with invalid_output, carrying the redacted raw reply, when the repair is wrong too', async () => {
    const { fake, result } = run({ suggestions: [{ name: 'x' }] }, { nope: true });
    const error = await failureOf(result);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.code).toBe('invalid_output');
    expect(fake.calls).toHaveLength(2);
  });

  it.each([
    ['zero grams', { grams: 0 }],
    ['an absurd amount', { grams: 100_000 }],
    ['negative calories', { kcal: -5 }],
    ['absurd calories', { kcal: 99_999 }],
    ['negative macros', { protein_g: -1 }],
    ['text where a number goes', { kcal: 'about 100' }],
    ['an empty name', { name: '' }],
    ['a very long reason', { reason: 'x'.repeat(2000) }],
  ])('refuses %s (validation, then the repair path)', async (_label, patch) => {
    const { fake, result } = run(list(good(patch)), list(good(patch)));
    expect((await failureOf(result)).code).toBe('invalid_output');
    expect(fake.calls).toHaveLength(2);
  });

  it('caps the list at the number the screen shows, keeping the first ones', async () => {
    const many = Array.from({ length: 12 }, (_, i) => good({ name: `Food ${i}`, kcal: 100 }));
    const { result } = run(list(...many));
    const out = await result;
    expect(MAX_SUGGESTIONS).toBe(5);
    expect(out.suggestions.map((s) => s.name)).toEqual(['Food 0', 'Food 1', 'Food 2', 'Food 3', 'Food 4']);
  });

  it('drops a suggestion that does not fit what is left (more calories than remain), and one whose numbers do not add up', async () => {
    const { result } = run(
      list(
        good({ name: 'Fits', kcal: 300, protein_g: 20, carbs_g: 30, fat_g: 11 }),
        good({ name: 'Too big', kcal: 900, protein_g: 40, carbs_g: 90, fat_g: 40 }),
        good({ name: 'Does not add up', kcal: 100, protein_g: 40, carbs_g: 40, fat_g: 40 }),
      ),
    );
    const out = await result;
    expect(out.suggestions.map((s) => s.name)).toEqual(['Fits']);
    expect(out.dropped).toBe(2);
  });

  it('removes duplicates by name', async () => {
    const { result } = run(list(good({ name: 'Manzana' }), good({ name: ' manzana ' }), good({ name: 'Pera' })));
    expect((await result).suggestions.map((s) => s.name)).toEqual(['Manzana', 'Pera']);
  });

  it('rounds amounts and values to what a person can read', async () => {
    const { result } = run(list(good({ grams: 170.4, kcal: 99.6, protein_g: 17.04, carbs_g: 6.06, fat_g: 0.74 })));
    expect((await result).suggestions[0]).toMatchObject({ grams: 170, kcal: 100, proteinG: 17, carbsG: 6.1, fatG: 0.7 });
  });

  it('turns the text into plain text: no markup, no control or direction characters, one line, bounded', async () => {
    const { result } = run(
      list(
        good({ name: '**Yogur** <b>griego</b>\n[link](http://x.test)', reason: '`Buena` opción‮\u0000 con\tproteína   ​' + 'y'.repeat(300) }),
      ),
    );
    const [s] = (await result).suggestions;
    expect(s!.name).toBe('Yogur griego link');
    expect(s!.reason).not.toMatch(/[`‮\u0000​\t\n]/);
    expect(s!.reason.startsWith('Buena opción con proteína')).toBe(true);
    expect(s!.reason.length).toBeLessThanOrEqual(160);
  });

  it.each([
    ['a moral word', 'Opción sin culpa para la noche'],
    ['an English moral word', 'A guilt-free treat'],
    ['"clean eating"', 'Clean eating choice'],
    ['a medical claim', 'Ayuda a curar la diabetes'],
    ['a medical claim in English', 'Helps treat high blood pressure'],
    ['a detox claim', 'Ideal para desintoxicar'],
  ])('drops a suggestion whose reason has %s', async (_label, reason) => {
    const { result } = run(list(good({ name: 'Bad one', reason }), good({ name: 'Fine one', reason: 'Aporta proteína.' })));
    const out = await result;
    expect(out.suggestions.map((s) => s.name)).toEqual(['Fine one']);
    expect(out.dropped).toBe(1);
  });

  it('gives an empty list, not an error, when nothing usable is left', async () => {
    const { result } = run(list(good({ kcal: 900, protein_g: 40, carbs_g: 90, fat_g: 40 })));
    expect(await result).toMatchObject({ suggestions: [], dropped: 1 });
  });

  it('the JSON schema sent to providers follows the same Zod schema, with bounds removed where a dialect rejects them', () => {
    const openai = suggestionsJsonSchema('openai') as any;
    expect(openai.properties.suggestions.maxItems).toBe(MAX_SUGGESTIONS);
    expect(openai.properties.suggestions.items.properties.grams).toMatchObject({ exclusiveMinimum: 0 });
    const anthropic = JSON.stringify(suggestionsJsonSchema('anthropic'));
    expect(anthropic).not.toMatch(/maxItems|maximum|exclusiveMinimum|maxLength/);
    expect(SuggestionList.safeParse(list()).success).toBe(true);
  });
});

describe('suggestFoods: when nothing is left to suggest, the provider is not called', () => {
  it('refuses before any request when almost nothing remains', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON.stringify(list()))));
    const below = { ...REMAINING, kcal: MIN_REMAINING_KCAL_FOR_SUGGESTIONS - 1 };
    const error = await failureOf(suggestFoods(input({ ...profiles.openai, outputMode: 'schema' }, { remaining: below }), deps(fake)));
    expect(error).toBeInstanceOf(NothingToSuggestError);
    expect(fake.calls).toHaveLength(0);
  });

  it('calls it from the threshold up, and for zero or negative calories never', async () => {
    const at = fakeFetch(res(200, openaiText(JSON.stringify(list(good({ kcal: 90, protein_g: 5, carbs_g: 12, fat_g: 3 }))))));
    await suggestFoods(input({ ...profiles.openai, outputMode: 'schema' }, { remaining: { ...REMAINING, kcal: MIN_REMAINING_KCAL_FOR_SUGGESTIONS } }), deps(at));
    expect(at.calls).toHaveLength(1);
    const none = fakeFetch(res(200, openaiText('{}')));
    for (const kcal of [0, -200, Number.NaN]) {
      await failureOf(suggestFoods(input({ ...profiles.openai, outputMode: 'schema' }, { remaining: { ...REMAINING, kcal } }), deps(none)));
    }
    expect(none.calls).toHaveLength(0);
  });
});
