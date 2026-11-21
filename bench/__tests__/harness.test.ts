/** @jest-environment node */
/// <reference types="node" />
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FetchLike, HttpResponse } from '../../src/core/ai';
import { buildFixtureCatalog } from '../../scripts/catalog/testing/fixture';
import { parseConfig } from '../config';
import { DatasetError } from '../dataset';
import { runBenchmark } from '../harness';
import type { BenchConfig } from '../types';

const KEY = 'sk-bench-SECRET-0123456789';
const catalog = buildFixtureCatalog();

const photo = (name: string) => Buffer.from(`fake-jpeg-bytes-${name}`);
const b64 = (name: string) => photo(name).toString('base64');

function item(name: string, canonical: string, grams: number) {
  return {
    name,
    canonical_name_en: canonical,
    search_terms_en: [],
    preparation: 'unknown',
    grams,
    portion_basis: 'test',
    confidence_food: 'high',
    confidence_portion: 'high',
    fallback_per_100g: { kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 },
  };
}
const scan = (items: unknown[], isFood = true) => ({ is_food: isFood, dish_name: 'dish', items, hidden_ingredients_note: '' });

function reply(status: number, body: unknown): HttpResponse {
  const text = JSON.stringify(body);
  return { status, headers: { get: () => null }, text: async () => text };
}
const ok = (result: unknown) =>
  reply(200, {
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(result), refusal: null } }],
    usage: { prompt_tokens: 800, completion_tokens: 200 },
  });

const RESPONSES = {
  m1: () => ok(scan([item('Pollo', 'chicken breast, grilled', 120), item('Arroz', 'white rice, cooked', 180)])),
  m2: () => ok(scan([item('Banano', 'banana', 118)])),
  n1: () => ok(scan([], false)),
} as const;
type Marker = keyof typeof RESPONSES;

interface Fake {
  fetch: FetchLike;
  calls: { marker: string; body: string; headers: Record<string, string> }[];
  override: Partial<Record<Marker, () => HttpResponse>>;
}
function fakeProvider(): Fake {
  const fake: Fake = {
    calls: [],
    override: {},
    fetch: async (_url, init) => {
      const body = init.body ?? '';
      const marker = (Object.keys(RESPONSES) as Marker[]).find((k) => body.includes(b64(k))) ?? 'unknown';
      fake.calls.push({ marker, body, headers: init.headers });
      return (fake.override[marker as Marker] ?? RESPONSES[marker as Marker])();
    },
  };
  return fake;
}

function writeMeal(root: string, id: string, meal: unknown, bytes: Buffer = photo(id)) {
  const dir = path.join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'photo.jpg'), bytes);
  writeFileSync(path.join(dir, 'meal.json'), typeof meal === 'string' ? meal : JSON.stringify(meal));
}

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'qn-bench-'));
  const data = path.join(root, 'meals');
  writeMeal(data, 'm1', {
    is_food: true,
    category: 'separated_plate',
    items: [
      { name: 'chicken breast, grilled', grams: 120, catalog_source_id: '1005' },
      { name: 'white rice, cooked', grams: 180, catalog_source_id: '1002' },
    ],
  });
  writeMeal(data, 'm2', {
    is_food: true,
    category: 'snack_fruit',
    items: [{ name: 'banana', grams: 100, catalog_source_id: '1001' }],
  });
  writeMeal(data, 'n1', { is_food: false });
  const config: BenchConfig = {
    adapter: 'openai_compatible',
    baseUrl: 'https://llm.example.test/v1',
    model: 'test-model',
    apiKey: KEY,
    keyEnvName: 'BENCH_API_KEY',
    dataDir: data,
    catalogPath: catalog.dbPath,
    cacheDir: path.join(root, 'cache'),
    outDir: path.join(root, 'results'),
    subset: 'all',
    delayMs: 0,
    timeoutS: 5,
    maxImageBytes: 1_000_000,
    offline: false,
  };
  return { root, data, config };
}

const deps = (fake: Fake) => ({ fetch: fake.fetch, sleep: async () => {}, log: () => {} });

function allFiles(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? allFiles(p) : [p];
    });
  } catch {
    return [];
  }
}

describe('runBenchmark', () => {
  it('runs the real pipeline end to end and writes the results and the summary', async () => {
    const { config } = setup();
    const fake = fakeProvider();
    const report = await runBenchmark(config, deps(fake));
    const { metrics } = report;

    expect(report.datasetSize).toEqual({ total: 3, food: 2, nonFood: 1 });
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(metrics.itemRecall).toBe(1);
    expect(metrics.itemPrecision).toBe(1);
    expect(metrics.matchingRate).toBe(1);
    expect(metrics.portionMape).toBeCloseTo(0.06, 10); // (0 + 0 + 0.18) / 3
    expect(metrics.portionBias).toBeCloseTo(0.06, 10);
    expect(metrics.energyMape).toBeCloseTo(0.09, 10); // (0 + 0.18) / 2
    expect(metrics.within10).toBe(0.5);
    expect(metrics.within20).toBe(1);
    expect(metrics.noFoodRateNonFoodPhotos).toBe(1);
    expect(metrics.noFoodRateFoodPhotos).toBe(0);
    expect(metrics.validFirstAttempt).toBe(1);
    expect(metrics.inputTokensPerScan).toBe(800);

    const m1 = report.meals.find((m) => m.id === 'm1')!;
    // 165 * 1.2 + 130 * 1.8 computed with the same core code
    expect(m1.trueNutrients?.kcal).toBeCloseTo(432, 6);
    expect(m1.predictedNutrients?.kcal).toBeCloseTo(432, 6);

    const files = allFiles(config.outDir);
    const json = files.find((f) => f.endsWith('.json'))!;
    const parsed = JSON.parse(readFileSync(json, 'utf8'));
    expect(parsed.model).toBe('test-model');
    expect(parsed.promptVersion).toBe(1);
    expect(parsed.datasetSize.total).toBe(3);
    const md = readFileSync(path.join(config.outDir, 'summary.md'), 'utf8');
    expect(md).toContain(
      '| Model | Prompt | Item recall | Portion error | Energy error | Within ±20% | Valid output | Median latency | Tokens per scan | Meals |',
    );
    expect(md).toContain('| test-model | v1 |');
    expect(md).toContain('3 meals');
  });

  it('serves a second run from the cache without calling the provider', async () => {
    const { config } = setup();
    const first = fakeProvider();
    const a = await runBenchmark(config, deps(first));
    const second = fakeProvider();
    const b = await runBenchmark(config, deps(second));
    expect(first.calls).toHaveLength(3);
    expect(second.calls).toHaveLength(0);
    expect(b.metrics).toEqual(a.metrics);
  });

  it('makes no provider call at all in offline mode and reports the missing meals', async () => {
    const { config } = setup();
    const fake = fakeProvider();
    const report = await runBenchmark({ ...config, offline: true }, deps(fake));
    expect(fake.calls).toHaveLength(0);
    expect(report.metrics.counts.scored).toBe(0);
    expect(report.meals.every((m) => m.status === 'failed' && m.errorCode === 'not_cached')).toBe(true);
  });

  it('a provider failure on one meal does not abort the run, and resuming retries only that meal', async () => {
    const { config } = setup();
    const fake = fakeProvider();
    fake.override.m2 = () => reply(401, { error: { message: `bad key ${KEY}`, type: 'invalid_request_error' } });
    const report = await runBenchmark(config, deps(fake));
    expect(report.metrics.counts.failed).toBe(1);
    expect(report.metrics.counts.scored).toBe(2);
    const m2 = report.meals.find((m) => m.id === 'm2')!;
    expect(m2.status).toBe('failed');
    expect(m2.errorCode).toBe('auth_invalid');
    expect(report.metrics.itemRecall).toBe(1); // m1 only; m2 excluded

    const resumed = fakeProvider();
    const again = await runBenchmark(config, deps(resumed));
    expect(resumed.calls.map((c) => c.marker)).toEqual(['m2']);
    expect(again.metrics.counts.failed).toBe(0);
  });

  it('the API key never appears in the cache, the results, or the summary', async () => {
    const { config } = setup();
    const fake = fakeProvider();
    fake.override.m2 = () => reply(401, { error: { message: `bad key ${KEY}`, type: 'invalid_request_error' } });
    fake.override.n1 = () => ok({ not: 'valid', echo: KEY });
    await runBenchmark(config, deps(fake));
    const files = [...allFiles(config.cacheDir), ...allFiles(config.outDir)];
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(encodeURIComponent(KEY));
    }
  });

  it('counts a reply that stays invalid after the repair as invalid output, not as a failure', async () => {
    const { config } = setup();
    const fake = fakeProvider();
    fake.override.n1 = () => ok({ nonsense: true });
    const report = await runBenchmark(config, deps(fake));
    expect(report.meals.find((m) => m.id === 'n1')!.status).toBe('invalid_output');
    expect(report.metrics.counts.failed).toBe(0);
    expect(report.metrics.validAfterRepair).toBeCloseTo(2 / 3, 10);
    expect(fake.calls.filter((c) => c.marker === 'n1')).toHaveLength(2); // first attempt + one repair
  });

  it('smoke subset runs a spread of at most 15 meals', async () => {
    const { data, config } = setup();
    for (let i = 0; i < 20; i++) {
      writeMeal(data, `z${String(i).padStart(2, '0')}`, { is_food: false }, photo(`z${i}`));
    }
    const fake = fakeProvider();
    const report = await runBenchmark({ ...config, subset: 'smoke' }, deps(fake));
    expect(report.datasetSize.total).toBe(15);
    expect(report.meals.map((m) => m.id)).toEqual(expect.arrayContaining(['m1', 'm2']));
  });
});

describe('data set validation', () => {
  it('names the file of an invalid meal.json and calls no provider', async () => {
    const { data, config } = setup();
    writeMeal(data, 'bad', {
      is_food: true,
      category: 'single_food',
      items: [{ name: 'x', grams: -5, catalog_source_id: '1001' }],
    });
    const fake = fakeProvider();
    const err = await runBenchmark(config, deps(fake)).catch((e) => e);
    expect(err).toBeInstanceOf(DatasetError);
    expect(err.message).toContain(path.join(data, 'bad', 'meal.json'));
    expect(err.message).toContain('items');
    expect(fake.calls).toHaveLength(0);
  });

  it('names the file when meal.json is not JSON', async () => {
    const { data, config } = setup();
    writeMeal(data, 'broken', '{ nope');
    const err = await runBenchmark(config, deps(fakeProvider())).catch((e) => e);
    expect(err).toBeInstanceOf(DatasetError);
    expect(err.message).toContain(path.join(data, 'broken', 'meal.json'));
  });

  it('rejects a ground-truth food that is not in the catalog, naming the file', async () => {
    const { data, config } = setup();
    writeMeal(data, 'ghost', {
      is_food: true,
      category: 'single_food',
      items: [{ name: 'x', grams: 10, catalog_source_id: '999999' }],
    });
    const err = await runBenchmark(config, deps(fakeProvider())).catch((e) => e);
    expect(err).toBeInstanceOf(DatasetError);
    expect(err.message).toContain(path.join(data, 'ghost', 'meal.json'));
    expect(err.message).toContain('999999');
  });

  it('rejects a photo above the byte limit with a clear message', async () => {
    const { data, config } = setup();
    writeMeal(data, 'big', { is_food: false }, Buffer.alloc(2_000));
    const err = await runBenchmark({ ...config, maxImageBytes: 1_000 }, deps(fakeProvider())).catch((e) => e);
    expect(err).toBeInstanceOf(DatasetError);
    expect(err.message).toContain(path.join(data, 'big', 'photo.jpg'));
    expect(err.message).toMatch(/1,?024 px/);
  });

  it('rejects a missing photo and an empty data set', async () => {
    const { data, config } = setup();
    mkdirSync(path.join(data, 'nophoto'));
    writeFileSync(path.join(data, 'nophoto', 'meal.json'), '{"is_food":false}');
    const err = await runBenchmark(config, deps(fakeProvider())).catch((e) => e);
    expect(err.message).toContain(path.join(data, 'nophoto', 'photo.jpg'));

    const empty = mkdtempSync(path.join(tmpdir(), 'qn-empty-'));
    const err2 = await runBenchmark({ ...config, dataDir: empty }, deps(fakeProvider())).catch((e) => e);
    expect(err2.message).toContain('No meals');
  });
});

describe('parseConfig', () => {
  const argv = ['--adapter', 'openai_compatible', '--base-url', 'https://x.test/v1', '--model', 'm'];

  it('has no default provider, base URL, or model', () => {
    expect(() => parseConfig([], {})).toThrow(/--adapter/);
    expect(() => parseConfig(['--adapter', 'openai_compatible'], {})).toThrow(/--base-url/);
    expect(() => parseConfig(['--adapter', 'openai_compatible', '--base-url', 'https://x.test'], {})).toThrow(/--model/);
  });
  it('reads the provider from flags or environment variables', () => {
    expect(parseConfig(argv, {}).model).toBe('m');
    const fromEnv = parseConfig([], { BENCH_ADAPTER: 'gemini', BENCH_BASE_URL: 'https://g.test', BENCH_MODEL: 'g1' });
    expect([fromEnv.adapter, fromEnv.baseUrl, fromEnv.model]).toEqual(['gemini', 'https://g.test', 'g1']);
  });
  it('rejects an unknown adapter', () => {
    expect(() => parseConfig(['--adapter', 'nope', '--base-url', 'https://x', '--model', 'm'], {})).toThrow(/adapter/);
  });
  it('takes the key from the variable named by --key-env, defaulting to BENCH_API_KEY', () => {
    expect(parseConfig(argv, { BENCH_API_KEY: 'a' }).apiKey).toBe('a');
    const named = parseConfig([...argv, '--key-env', 'MY_KEY'], { MY_KEY: 'b', BENCH_API_KEY: 'a' });
    expect(named.apiKey).toBe('b');
    expect(named.keyEnvName).toBe('MY_KEY');
    expect(parseConfig(argv, {}).apiKey).toBeNull();
  });
  it('parses subset, delay, and offline', () => {
    const c = parseConfig([...argv, '--subset', 'smoke', '--delay-ms', '2500', '--offline'], {});
    expect([c.subset, c.delayMs, c.offline]).toEqual(['smoke', 2500, true]);
    expect(() => parseConfig([...argv, '--subset', 'big'], {})).toThrow(/subset/);
    expect(() => parseConfig([...argv, '--delay-ms', '-1'], {})).toThrow(/delay/);
  });
});
