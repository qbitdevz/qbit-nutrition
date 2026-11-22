import {
  SAMPLE_JPEG_BASE64,
  anthropicText,
  fakeFetch,
  geminiText,
  hangingResponder,
  noSleep,
  openaiError,
  openaiText,
  profiles,
  res,
  validScanResult,
} from '../__fixtures__/fixtures';
import { checkScanResult } from '../checks';
import { NoFoodDetectedError, ProviderError } from '../errors';
import { analyzeMeal, createVisionGateway, testConnection } from '../pipeline';
import type { ProviderProfile } from '../types';

const JSON_TEXT = JSON.stringify(validScanResult);
type Fake = ReturnType<typeof fakeFetch>;

function input(profile: ProviderProfile, signal = new AbortController().signal) {
  return {
    profile,
    apiKey: 'test-key',
    imageJpegBase64: SAMPLE_JPEG_BASE64,
    locale: 'es' as const,
    hint: 'sin sal',
    signal,
  };
}
const deps = (fake: Fake) => ({ fetch: fake.fetch, sleep: noSleep });
const openai = { ...profiles.openai, outputMode: 'schema' as const };

async function failureOf(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

const withItem = (patch: object) => ({
  ...validScanResult,
  items: [{ ...validScanResult.items[0], ...patch }, validScanResult.items[1]],
});

describe('analyzeMeal', () => {
  it('returns the validated result with the metadata of the contract', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
    const out = await analyzeMeal(input(openai), deps(fake));
    expect(out.result).toEqual(validScanResult);
    expect(out.repaired).toBe(false);
    expect(out.outputModeUsed).toBe('schema');
    expect(out.promptVersion).toBe(1);
    expect(out.usage).toEqual({ inputTokens: 812, outputTokens: 240 });
    expect(out.checks.items.map((i) => i.fallbackUsable)).toEqual([true, true]);
    expect(fake.calls[0].rawBody).toContain('Spanish (es)');
  });

  it('uses the first supported mode when the profile has none stored yet', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
    const out = await analyzeMeal(input(profiles.openai), deps(fake));
    expect(out.outputModeUsed).toBe('schema');
  });

  describe('token usage when the repair call ran (S7)', () => {
    const bad = { ...validScanResult, items: [{ ...validScanResult.items[0], grams: 0 }] };
    const usage = { prompt_tokens: 812, completion_tokens: 240 };

    it('reports only the tokens of the call that reported, marked as partial, when the second call reports none', async () => {
      const fake = fakeFetch(res(200, openaiText(JSON.stringify(bad), usage)), res(200, openaiText(JSON_TEXT, false)));
      const out = await analyzeMeal(input(openai), deps(fake));
      expect(out.repaired).toBe(true);
      expect(out.usage).toBeUndefined(); // never a partial sum presented as the total
      expect(out.usagePartial).toEqual({ inputTokens: 812, outputTokens: 240 });
    });

    it('does the same when the first call reports none and the second reports', async () => {
      const fake = fakeFetch(res(200, openaiText(JSON.stringify(bad), false)), res(200, openaiText(JSON_TEXT, usage)));
      const out = await analyzeMeal(input(openai), deps(fake));
      expect(out.repaired).toBe(true);
      expect(out.usage).toBeUndefined();
      expect(out.usagePartial).toEqual({ inputTokens: 812, outputTokens: 240 });
    });

    it('reports nothing at all when neither call reports', async () => {
      const fake = fakeFetch(res(200, openaiText(JSON.stringify(bad), false)), res(200, openaiText(JSON_TEXT, false)));
      const out = await analyzeMeal(input(openai), deps(fake));
      expect(out.usage).toBeUndefined();
      expect(out.usagePartial).toBeUndefined();
    });

    it('a single call that reports is complete, and has no partial figure', async () => {
      const out = await analyzeMeal(input(openai), deps(fakeFetch(res(200, openaiText(JSON_TEXT)))));
      expect(out.usage).toEqual({ inputTokens: 812, outputTokens: 240 });
      expect(out.usagePartial).toBeUndefined();
    });
  });

  describe('repair', () => {
    const bad = { ...validScanResult, items: [{ ...validScanResult.items[0], grams: 0 }] };

    it('sends the validation error back once and returns the repaired result', async () => {
      const fake = fakeFetch(res(200, openaiText(JSON.stringify(bad))), res(200, openaiText(JSON_TEXT)));
      const out = await analyzeMeal(input(openai), deps(fake));
      expect(out.repaired).toBe(true);
      expect(out.result).toEqual(validScanResult);
      expect(out.usage).toEqual({ inputTokens: 1624, outputTokens: 480 }); // both calls count
      expect(fake.calls).toHaveLength(2);
      const msgs = fake.calls[1].body!.messages;
      expect(msgs.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
      expect(msgs[2].content).toBe(JSON.stringify(bad));
      expect(msgs[3].content).toContain('items.0.grams');
      expect(msgs[1].content.some((p: any) => p.type === 'image_url')).toBe(true); // original request is kept
    });

    it('repairs output that is not JSON at all', async () => {
      const fake = fakeFetch(res(200, openaiText('Sure! It looks like chicken and rice.')), res(200, openaiText(JSON_TEXT)));
      const out = await analyzeMeal(input(openai), deps(fake));
      expect(out.repaired).toBe(true);
      expect(fake.calls[1].body!.messages[3].content).toContain('not valid JSON');
    });

    it('builds the repair turns in each provider format', async () => {
      const a = fakeFetch(res(200, anthropicText('nope')), res(200, anthropicText(JSON_TEXT)));
      await analyzeMeal(input({ ...profiles.anthropic, outputMode: 'schema' }), deps(a));
      expect(a.calls[1].body!.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);

      const g = fakeFetch(res(200, geminiText('nope')), res(200, geminiText(JSON_TEXT)));
      await analyzeMeal(input({ ...profiles.gemini, outputMode: 'schema' }), deps(g));
      expect(g.calls[1].body!.contents.map((m: any) => m.role)).toEqual(['user', 'model', 'user']);
    });

    it('stops with invalid_output after a second validation failure, keeping the raw response redacted', async () => {
      const fake = fakeFetch(res(200, openaiText(JSON.stringify(bad))), res(200, openaiText('{"is_food": "maybe"}')));
      const err = await failureOf(analyzeMeal(input(openai), deps(fake)));
      expect(err).toBeInstanceOf(ProviderError);
      expect(err.code).toBe('invalid_output');
      expect(err.rawResponse).toContain('maybe');
      expect(fake.calls).toHaveLength(2); // exactly one repair
    });

    it('does not repair provider errors', async () => {
      const fake = fakeFetch(res(401, openaiError('bad key', 'invalid_request_error')));
      await expect(analyzeMeal(input(openai), deps(fake))).rejects.toMatchObject({ code: 'auth_invalid' });
      expect(fake.calls).toHaveLength(1);
    });
  });

  describe('no food', () => {
    it.each([
      ['is_food false', { ...validScanResult, is_food: false, items: [] }],
      ['empty items', { ...validScanResult, items: [] }],
      ['is_food false with items', { ...validScanResult, is_food: false }],
    ])('ends the scan with NoFoodDetectedError for %s, without a repair', async (_n, body) => {
      const fake = fakeFetch(res(200, openaiText(JSON.stringify(body))));
      const err = await failureOf(analyzeMeal(input(openai), deps(fake)));
      expect(err).toBeInstanceOf(NoFoodDetectedError);
      expect(err).not.toBeInstanceOf(ProviderError);
      expect(fake.calls).toHaveLength(1);
    });
  });

  describe('device-side checks', () => {
    it('discards an implausible fallback and keeps the item', async () => {
      const body = withItem({ fallback_per_100g: { kcal: 500, protein_g: 1, carbs_g: 1, fat_g: 1 } });
      const out = await analyzeMeal(input(openai), deps(fakeFetch(res(200, openaiText(JSON.stringify(body)))))) ;
      expect(out.checks.items[0].fallbackUsable).toBe(false);
      expect(out.checks.items[0].warnings).toContain('fallback_implausible');
      expect(out.checks.items[1].fallbackUsable).toBe(true);
      expect(out.result.items).toHaveLength(2);
    });

    it('flags extreme weights without blocking', async () => {
      const body = withItem({ grams: 1900 });
      const out = await analyzeMeal(input(openai), deps(fakeFetch(res(200, openaiText(JSON.stringify(body))))));
      expect(out.checks.items[0].warnings).toContain('item_weight_extreme');
      expect(out.result.items[0].grams).toBe(1900);
    });
  });

  describe('HTTPS rule', () => {
    it('rejects plain HTTP to a public host before sending anything', async () => {
      const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
      const err = await failureOf(analyzeMeal(input({ ...openai, baseUrl: 'http://api.example.test/v1' }), deps(fake)));
      expect(err.code).toBe('insecure_url');
      expect(fake.calls).toHaveLength(0);
    });

    it.each([profiles.anthropic, profiles.gemini])('applies to every adapter (%#)', async (p) => {
      const fake = fakeFetch(res(200, {}));
      const err = await failureOf(analyzeMeal(input({ ...p, baseUrl: 'http://8.8.8.8' }), deps(fake)));
      expect(err.code).toBe('insecure_url');
      expect(fake.calls).toHaveLength(0);
    });
  });

  describe('cancellation', () => {
    it('does not send when already aborted', async () => {
      const ctl = new AbortController();
      ctl.abort();
      const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
      const err = await failureOf(analyzeMeal(input(openai, ctl.signal), deps(fake)));
      expect(err.name).toBe('AbortError');
      expect(err).not.toBeInstanceOf(ProviderError);
      expect(fake.calls).toHaveLength(0);
    });

    it('aborts an in-flight request and passes the signal to fetch', async () => {
      const ctl = new AbortController();
      const fake = fakeFetch(hangingResponder);
      const pending = failureOf(analyzeMeal(input(openai, ctl.signal), deps(fake)));
      await new Promise((r) => setTimeout(r, 10));
      ctl.abort();
      const err = await pending;
      expect(err.name).toBe('AbortError');
      expect(fake.calls).toHaveLength(1); // not retried
    });

    it('stops waiting even if fetch ignores the signal', async () => {
      const ctl = new AbortController();
      const never = fakeFetch(() => new Promise(() => {}));
      const pending = failureOf(analyzeMeal(input(openai, ctl.signal), deps(never)));
      setTimeout(() => ctl.abort(), 10);
      expect((await pending).name).toBe('AbortError');
    });

    it('cancels during the retry delay', async () => {
      const ctl = new AbortController();
      const fake = fakeFetch(res(503, 'down'));
      const err = await failureOf(
        analyzeMeal(input(openai, ctl.signal), {
          fetch: fake.fetch,
          sleep: async () => ctl.abort(),
        }),
      );
      expect(err.name).toBe('AbortError');
      expect(fake.calls).toHaveLength(1);
    });
  });

  it('times out as a ProviderError, not a cancellation', async () => {
    const fake = fakeFetch(hangingResponder);
    const err = await failureOf(analyzeMeal(input({ ...openai, timeoutS: 0.02 }), deps(fake)));
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('timeout');
  });
});

describe('checkScanResult', () => {
  const fb = (kcal: number, p: number, c: number, f: number) => ({
    fallback_per_100g: { kcal, protein_g: p, carbs_g: c, fat_g: f },
  });
  const usable = (patch: object) => checkScanResult(withItem(patch) as any).items[0].fallbackUsable;

  it('accepts values near 4p + 4c + 9f', () => {
    expect(usable(fb(165, 31, 0, 3.6))).toBe(true); // 156.4 computed
    expect(usable(fb(34, 2.8, 7, 0.4))).toBe(true); // fibre makes broccoli drift
    expect(usable(fb(0, 0, 0, 0))).toBe(true); // water
  });

  it('rejects energy that does not fit the macros', () => {
    expect(usable(fb(500, 1, 1, 1))).toBe(false);
    expect(usable(fb(20, 30, 30, 30))).toBe(false);
  });

  it('rejects physically impossible fallbacks', () => {
    expect(usable(fb(950, 0, 0, 105))).toBe(false); // macros above 100 g per 100 g
    expect(usable(fb(0, 50, 50, 20))).toBe(false);
  });

  it('flags tiny and extreme items and heavy meals', () => {
    const r = checkScanResult({
      ...validScanResult,
      items: [
        { ...validScanResult.items[0], grams: 1 },
        { ...validScanResult.items[0], grams: 1300 },
        { ...validScanResult.items[0], grams: 1300 },
      ],
    } as any);
    expect(r.items[0].warnings).toEqual(['item_weight_tiny']);
    expect(r.items[1].warnings).toEqual(['item_weight_extreme']);
    expect(r.mealWarnings).toEqual(['meal_weight_extreme']);
  });

  it('has no warnings for a normal meal', () => {
    const r = checkScanResult(validScanResult as any);
    expect(r.items.every((i) => i.warnings.length === 0)).toBe(true);
    expect(r.mealWarnings).toEqual([]);
  });
});

describe('testConnection', () => {
  const sample = { sampleImageJpegBase64: SAMPLE_JPEG_BASE64 };
  const reject400 = () => res(400, openaiError('Unsupported parameter', 'invalid_request_error'));

  it('picks schema mode when it works', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
    expect(await testConnection(profiles.openai, 'test-key', deps(fake), sample)).toEqual({ ok: true, outputMode: 'schema' });
    expect(fake.calls).toHaveLength(1);
  });

  it('falls back to tool mode, then to prompt mode, in order', async () => {
    const toolBody = { choices: [{ message: { tool_calls: [{ function: { name: 'record_scan_result', arguments: JSON_TEXT } }] } }] };
    const f1 = fakeFetch(reject400(), res(200, toolBody));
    expect(await testConnection(profiles.openai, 'test-key', deps(f1), sample)).toEqual({ ok: true, outputMode: 'tool' });
    expect(f1.calls.map((c) => Boolean(c.body!.response_format))).toEqual([true, false]);

    const f2 = fakeFetch(reject400(), reject400(), res(200, openaiText(JSON_TEXT)));
    expect(await testConnection(profiles.openai, 'test-key', deps(f2), sample)).toEqual({ ok: true, outputMode: 'prompt' });
    expect(f2.calls).toHaveLength(3);
  });

  it('moves on when a mode returns output that fails validation', async () => {
    const fake = fakeFetch(res(200, openaiText('{}')), res(200, openaiText(JSON_TEXT)));
    // The stored mode is ignored: a test always probes from the strongest mode.
    const out = await testConnection({ ...profiles.openai, outputMode: 'prompt' }, 'test-key', deps(fake), sample);
    expect(out).toEqual({ ok: true, outputMode: 'tool' });
    expect(fake.calls).toHaveLength(2); // no repair during probing
  });

  it('skips modes the adapter does not support (Gemini has no tool mode)', async () => {
    const fake = fakeFetch(res(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'bad schema' } }), res(200, geminiText(JSON_TEXT)));
    expect(await testConnection(profiles.gemini, 'test-key', deps(fake), sample)).toEqual({ ok: true, outputMode: 'prompt' });
    expect(fake.calls).toHaveLength(2);
  });

  it('stops at once on errors that another mode cannot fix', async () => {
    const fake = fakeFetch(res(401, openaiError('bad key', 'invalid_request_error')));
    const out = await testConnection(profiles.openai, 'test-key', deps(fake), sample);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('auth_invalid');
    expect(fake.calls).toHaveLength(1);
  });

  it('reports the last error when no mode works', async () => {
    const fake = fakeFetch(res(200, openaiText('not json')));
    const out = await testConnection(profiles.openai, 'test-key', deps(fake), sample);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('invalid_output');
    expect(fake.calls).toHaveLength(3);
  });

  it('counts a "no food" answer as a working mode', async () => {
    const body = JSON.stringify({ ...validScanResult, is_food: false, items: [] });
    const out = await testConnection(profiles.openai, 'test-key', deps(fakeFetch(res(200, openaiText(body)))), sample);
    expect(out).toEqual({ ok: true, outputMode: 'schema' });
  });

  it('returns insecure_url as a failed test, not an exception', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
    const out = await testConnection({ ...profiles.openai, baseUrl: 'http://api.example.test/v1' }, null, deps(fake), sample);
    expect(out.ok).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('createVisionGateway', () => {
  it('exposes the VisionAdapter contract bound to the injected fetch', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
    const gateway = createVisionGateway(deps(fake));
    const out = await gateway.analyzeMeal(input(openai));
    expect(out.result.is_food).toBe(true);
  });
});
