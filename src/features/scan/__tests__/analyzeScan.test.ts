import { hangingResponder, res, validScanResult, openaiText } from '@/core/ai/__fixtures__/fixtures';
import { PROMPT_VERSION } from '@/core/ai';
import { createHarness, type Harness } from '@/data/testing/harness';
import { createScanKit, KEY, okReply, type ScanKit } from '../../testing/scanKit';
import { analyzePhoto, type ScanOutcome } from '../analyzeScan';
import { createScanDeps } from '../scanDeps';

let h: Harness;
let kit: ScanKit;
afterEach(() => {
  kit?.services.close();
  h.close();
});

async function setup(...args: Parameters<typeof createScanKit> extends [Harness, ...infer R] ? R : never) {
  h = await createHarness();
  kit = await createScanKit(h, ...args);
  return kit;
}

const photo = () => ({ uri: 'file:///cache/shot-1.jpg', width: 4000, height: 3000 });
const run = (extra: { hint?: string; signal?: AbortSignal; locale?: 'en' | 'es' } = {}): Promise<ScanOutcome> =>
  analyzePhoto(createScanDeps(kit.services, kit.platform), { photo: photo(), locale: 'en', signal: new AbortController().signal, ...extra });

describe('analyzePhoto: success', () => {
  it('matches each item to the catalog and computes its nutrients from the catalog values', async () => {
    await setup();
    const outcome = await run({ hint: 'the rice is about 180 g' });
    if (outcome.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
    expect(outcome.dishName).toBe('Chicken with rice');
    expect(outcome.items.map((i) => [i.displayName, i.grams, i.scan?.kind])).toEqual([
      ['Pollo a la plancha', 120, 'matched'],
      ['Arroz blanco', 180, 'matched'],
    ]);
    // Per 100 g from the catalog (chicken, grilled: 165 kcal; rice, cooked: 130 kcal), not from the model's fallback.
    expect(outcome.items[0]!.per100g).toMatchObject({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 });
    expect(outcome.items[1]!.per100g).toMatchObject({ kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28 });
    expect(outcome.items[0]!.ref).toEqual({ source: 'catalog', id: expect.any(String) });
    expect(outcome.items[0]!.scan).toMatchObject({ confidenceFood: 'high', confidencePortion: 'medium', aiGrams: 120, detectedName: 'Pollo a la plancha', swapped: false });
  });

  it('sends the downscaled photo, the hint and the locale, and nothing else about the person', async () => {
    await setup();
    await run({ hint: 'cooked in olive oil', locale: 'es' });
    expect(kit.fetch.calls).toHaveLength(1);
    const sent = kit.fetch.calls[0]!.rawBody!;
    expect(sent).toContain('cooked in olive oil');
    expect(sent).toContain('Spanish (es)');
    expect(sent).toContain(kit.platform.state.lastPrepared!.base64);
    expect(sent).not.toContain('file:///');
    expect(kit.platform.state.prepareCalls).toBe(1);
  });

  it('records the attempt in `scan` with the provider copied, the prompt version, tokens, latency and the validated result', async () => {
    await setup();
    const outcome = await run({ hint: 'a hint' });
    if (outcome.kind !== 'ok') throw new Error('expected ok');
    const rows = await h.repos.scans.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: outcome.scanId,
      providerId: kit.providerId,
      providerLabel: 'Test provider',
      model: 'test-model',
      promptVersion: String(PROMPT_VERSION),
      status: 'ok',
      errorCode: null,
      hint: 'a hint',
      inputTokens: 812,
      outputTokens: 240,
      repaired: 0,
    });
    expect(rows[0]!.latencyMs).not.toBeNull();
    expect(JSON.parse(rows[0]!.resultJson!)).toEqual(validScanResult);
  });

  it('marks the scan as repaired when the second reply was the one that validated', async () => {
    await setup([res(200, openaiText('not json')), okReply()]);
    await run();
    expect((await h.repos.scans.list())[0]).toMatchObject({ status: 'ok', repaired: 1 });
  });

  it('uses the model fallback values, as an AI estimate, for a food that is not in the catalog', async () => {
    const unknown = { ...validScanResult.items[0]!, name: 'Zorblax stew', canonical_name_en: 'zorblax stew', search_terms_en: ['zorblax'], fallback_per_100g: { kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 4 } };
    await setup([okReply({ ...validScanResult, items: [unknown] })]);
    const outcome = await run();
    if (outcome.kind !== 'ok') throw new Error('expected ok');
    expect(outcome.items[0]).toMatchObject({ ref: null, per100g: { kcal: 100, protein: 5, carbs: 10, fat: 4 }, scan: { kind: 'estimate' } });
  });

  it('gives an item whose fallback is not plausible no numbers at all: it needs a manual match', async () => {
    const bogus = { ...validScanResult.items[0]!, name: 'Zorblax stew', canonical_name_en: 'zorblax stew', search_terms_en: ['zorblax'], fallback_per_100g: { kcal: 20, protein_g: 80, carbs_g: 60, fat_g: 30 } };
    await setup([okReply({ ...validScanResult, items: [bogus] })]);
    const outcome = await run();
    if (outcome.kind !== 'ok') throw new Error('expected ok');
    expect(outcome.items[0]).toMatchObject({ ref: null, per100g: null, scan: { kind: 'needs_match', warnings: expect.arrayContaining(['fallback_implausible']) } });
  });

  it('applies a remembered correction before scoring', async () => {
    await setup();
    const [brown] = await kit.services.catalog.search('brown rice', 'en', 1);
    await kit.services.catalog.rememberCorrection('Arroz blanco', brown!.ref);
    const outcome = await run();
    if (outcome.kind !== 'ok') throw new Error('expected ok');
    expect(outcome.items[1]!.ref).toEqual(brown!.ref);
    expect(outcome.items[1]!.per100g).toMatchObject({ kcal: 123 });
  });

  it('carries the weight flags of core and rounds grams to whole numbers of at least 1', async () => {
    const heavy = { ...validScanResult.items[0]!, grams: 1500 };
    const tiny = { ...validScanResult.items[1]!, grams: 0.4 };
    await setup([okReply({ ...validScanResult, items: [heavy, tiny] })]);
    const outcome = await run();
    if (outcome.kind !== 'ok') throw new Error('expected ok');
    expect(outcome.items[0]!.scan!.warnings).toContain('item_weight_extreme');
    expect(outcome.items[1]!.scan!.warnings).toContain('item_weight_tiny');
    expect(outcome.items[1]!.grams).toBe(1);
    expect(outcome.mealWarnings).toEqual([]);
  });
});

describe('analyzePhoto: failures (flow C), each recorded in `scan`', () => {
  const failed = (outcome: ScanOutcome) => {
    if (outcome.kind !== 'failed') throw new Error(`expected failed, got ${outcome.kind}`);
    return outcome.failure;
  };

  it('has no provider: nothing is sent and nothing is recorded (there is no provider to copy)', async () => {
    await setup([okReply()], { provider: false });
    const failure = failed(await run());
    expect(failure.kind).toBe('no_provider');
    expect(kit.fetch.calls).toHaveLength(0);
    expect(await h.repos.scans.list()).toEqual([]);
  });

  it.each([
    ['no network', new Error('Network request failed'), 'no_network', 'no_network'],
    ['an invalid key', res(401, { error: { message: 'bad key' } }), 'auth_invalid', 'auth_invalid'],
    ['a limit reached', res(429, { error: { message: 'slow down' } }, { 'Retry-After': '7800' }), 'quota', 'quota_exceeded'],
  ] as const)('%s', async (_name, responder, kind, code) => {
    await setup([responder]);
    const failure = failed(await run());
    expect(failure.kind).toBe(kind);
    expect(failure.providerLabel).toBe('Test provider');
    const [row] = await h.repos.scans.list();
    expect(row).toMatchObject({ status: 'error', errorCode: code, resultJson: null, providerLabel: 'Test provider' });
  });

  it('carries the wait the provider reports for a limit', async () => {
    await setup([res(429, { error: { message: 'slow down' } }, { 'Retry-After': '7800' })]);
    expect(failed(await run()).retryAfterS).toBe(7800);
  });

  it('cannot use a reply that fails validation twice', async () => {
    await setup([res(200, openaiText('nope')), res(200, openaiText('still nope'))]);
    expect(failed(await run()).kind).toBe('invalid_output');
    expect(await h.repos.scans.list()).toMatchObject([{ status: 'error', errorCode: 'invalid_output', repaired: 0 }]);
  });

  it('finds no food: status no_food, and its own failure kind', async () => {
    await setup([okReply({ is_food: false, dish_name: '', items: [], hidden_ingredients_note: '' })]);
    expect(failed(await run()).kind).toBe('no_food');
    expect(await h.repos.scans.list()).toMatchObject([{ status: 'no_food', errorCode: null }]);
  });

  it('refuses a profile that changed while the scan started', async () => {
    await setup();
    const realGet = kit.services.secrets.get.bind(kit.services.secrets);
    jest.spyOn(kit.services.secrets, 'get').mockImplementation(async (id) => {
      await h.repos.aiProviders.update(id, { baseUrl: 'https://other.example.test/v1' });
      return realGet(id);
    });
    expect(failed(await run()).kind).toBe('provider_changed');
    expect(kit.fetch.calls).toHaveLength(0);
    expect(await h.repos.scans.list()).toMatchObject([{ status: 'error', errorCode: 'provider_changed' }]);
  });

  it('refuses an insecure URL without sending anything', async () => {
    await setup([okReply()], { baseUrl: 'http://api.example.test/v1' });
    expect(failed(await run()).kind).toBe('insecure_url');
    expect(kit.fetch.calls).toHaveLength(0);
    expect(await h.repos.scans.list()).toMatchObject([{ status: 'error', errorCode: 'insecure_url' }]);
  });

  it('keeps the key out of the failure detail, whatever the platform error says', async () => {
    await setup([new Error(`boom with ${KEY} inside`)]);
    const outcome = await run();
    const failure = failed(outcome);
    expect(JSON.stringify(outcome)).not.toContain(KEY);
    expect(failure.detail ?? '').not.toContain(KEY);
    expect(JSON.stringify(await h.repos.scans.list())).not.toContain(KEY);
  });

  it('reports an unexpected error as unknown, with a redacted detail', async () => {
    await setup();
    jest.spyOn(kit.services.catalog, 'match').mockRejectedValue(new Error(`database said ${KEY}`));
    const outcome = await run();
    const failure = failed(outcome);
    expect(failure.kind).toBe('unknown');
    expect(failure.detail).toBeTruthy();
    expect(JSON.stringify(outcome)).not.toContain(KEY);
  });

  it('reports a photo that cannot be prepared, and sends nothing', async () => {
    await setup();
    kit.platform.state.failPrepare = true;
    expect(failed(await run()).kind).toBe('photo_unreadable');
    expect(kit.fetch.calls).toHaveLength(0);
    expect(await h.repos.scans.list()).toMatchObject([{ status: 'error', errorCode: 'image_failed' }]);
  });
});

describe('analyzePhoto: cancel', () => {
  it('aborts the request, returns cancelled, records the attempt, and stores no meal', async () => {
    await setup([hangingResponder]);
    const controller = new AbortController();
    const pending = run({ signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(kit.fetch.calls).toHaveLength(1);
    controller.abort();
    const outcome = await pending;
    expect(outcome.kind).toBe('cancelled');
    expect(await h.repos.scans.list()).toMatchObject([{ status: 'error', errorCode: 'cancelled' }]);
    expect((await h.repos.meals.getDay('2026-06-15')).meals).toEqual([]);
  });

  it('does not call the provider when it was cancelled before the request started', async () => {
    await setup();
    const controller = new AbortController();
    controller.abort();
    expect((await run({ signal: controller.signal })).kind).toBe('cancelled');
    expect(kit.fetch.calls).toHaveLength(0);
  });
});

describe('analyzePhoto: retry', () => {
  it('reuses the prepared photo instead of processing it again', async () => {
    await setup([new Error('Network request failed'), new Error('Network request failed'), okReply()]);
    const first = await run();
    expect(first.kind).toBe('failed');
    const prepared = first.kind === 'failed' ? first.prepared : null;
    expect(prepared).not.toBeNull();
    const second = await analyzePhoto(createScanDeps(kit.services, kit.platform), { photo: photo(), prepared, locale: 'en', signal: new AbortController().signal });
    expect(second.kind).toBe('ok');
    expect(kit.platform.state.prepareCalls).toBe(1);
    expect(await h.repos.scans.list()).toHaveLength(2);
  });
});
