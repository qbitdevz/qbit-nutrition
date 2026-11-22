import { SAMPLE_JPEG_BASE64, fakeFetch, openaiError, openaiText, res, validScanResult } from '@/core/ai/__fixtures__/fixtures';
import type { Responder } from '@/core/ai/__fixtures__/fixtures';
import { createHarness, type Harness } from '@/data/testing/harness';
import { createTestServices } from '../../testing/testServices';
import { SAMPLE_MEAL_JPEG_BASE64 } from '../sampleMeal';
import { ScanSetupError } from '../../scan/scanGateway';

const KEY = 'sk-LEAKCHECK-abcdef0123456789';
const NEW_KEY = 'sk-REPLACED-zyxwvu9876543210';
const URL_A = 'https://llm.example.test/v1';
const URL_B = 'https://other.example.test/v1';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let servicesOpen = false;
let fake: ReturnType<typeof fakeFetch>;

function setup(...responders: Responder[]) {
  if (servicesOpen) services.close();
  fake = fakeFetch(...(responders.length ? responders : [new Error('Network request failed')]));
  services = createTestServices(h, { fetch: fake.fetch });
  servicesOpen = true;
}

beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => {
  if (servicesOpen) services.close();
  servicesOpen = false;
  h.close();
  jest.restoreAllMocks();
});

const base = { label: 'Mine', preset: null, adapter: 'openai_compatible' as const, baseUrl: URL_A, model: 'whatever-model', timeoutS: 30 };

const everyStoredValue = (): string => {
  const tables = h.client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => String(r.name));
  const dump: Record<string, unknown> = {};
  for (const table of tables) dump[table] = h.client.prepare(`SELECT * FROM "${table}"`).all();
  return JSON.stringify(dump);
};

describe('saving a key (S3)', () => {
  it('keeps the key in the secret store under the profile id, and nowhere in the database', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    expect(await services.secrets.get(created.id)).toBe(KEY);
    expect(created.hasKey).toBe(true);

    await h.repos.settings.set('anything', 'x');
    const dump = everyStoredValue();
    expect(dump).toContain('whatever-model'); // the scan does see the profile row
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain('LEAKCHECK');
  });

  it('never hands the key back: views carry only whether one is set', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    for (const view of [created, await services.providers.get(created.id), ...(await services.providers.list())]) {
      expect(JSON.stringify(view)).not.toContain(KEY);
      expect(view).toMatchObject({ hasKey: true });
    }
  });

  it('replaces a key and removes it', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    const replaced = await services.providers.update(created.id, { apiKey: NEW_KEY });
    expect(await services.secrets.get(created.id)).toBe(NEW_KEY);
    expect(replaced.hasKey).toBe(true);
    const cleared = await services.providers.removeKey(created.id);
    expect(cleared.hasKey).toBe(false);
    expect(await services.secrets.has(created.id)).toBe(false);
  });

  it('does not create a profile whose key could not be stored', async () => {
    setup();
    jest.spyOn(services.secrets, 'set').mockRejectedValue(new Error('keystore unavailable'));
    await expect(services.providers.create({ ...base, apiKey: KEY })).rejects.toThrow();
    expect(await services.providers.list()).toEqual([]);
  });
});

describe('a key only ever goes to its own base URL', () => {
  it('clears the key when the base URL changes', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    const moved = await services.providers.update(created.id, { baseUrl: URL_B });
    expect(moved.hasKey).toBe(false);
    expect(await services.secrets.has(created.id)).toBe(false);
  });

  it('keeps the key when the URL is only written differently (trailing slash, spaces)', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    const same = await services.providers.update(created.id, { baseUrl: `  ${URL_A}/  ` });
    expect(same.hasKey).toBe(true);
    expect(same.baseUrl).toBe(URL_A);
  });

  it('keeps a replacement key typed together with a new base URL, and drops the old one', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await services.providers.update(created.id, { baseUrl: URL_B, apiKey: NEW_KEY });
    expect(await services.secrets.get(created.id)).toBe(NEW_KEY);
  });

  it('forgets that the notice was acknowledged when the destination changes', async () => {
    setup();
    const created = await services.providers.create({ ...base });
    await services.scan.acknowledgeNotice(created.id);
    await services.providers.update(created.id, { baseUrl: URL_B });
    expect(await services.scan.noticeAcknowledged(created.id)).toBe(false);
  });

  it('refuses to save an insecure base URL and leaves the stored profile and key as they were', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await expect(services.providers.update(created.id, { baseUrl: 'http://public.example.com/v1' })).rejects.toMatchObject({ code: 'insecure_url' });
    expect((await services.providers.get(created.id))?.baseUrl).toBe(URL_A);
    expect(await services.secrets.get(created.id)).toBe(KEY);
    await expect(services.providers.create({ ...base, baseUrl: 'http://public.example.com/v1' })).rejects.toMatchObject({ code: 'insecure_url' });
  });

  it('allows plain http on a private network', async () => {
    setup();
    await expect(services.providers.create({ ...base, baseUrl: 'http://192.168.1.20:11434/v1' })).resolves.toMatchObject({ baseUrl: 'http://192.168.1.20:11434/v1' });
  });
});

describe('deleting and activating', () => {
  it('deletes the key (and the notice mark) with the profile', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await services.scan.acknowledgeNotice(created.id);
    await services.providers.remove(created.id);
    expect(await services.secrets.has(created.id)).toBe(false);
    expect(await services.providers.get(created.id)).toBeNull();
    expect(await h.repos.settings.getAll()).toEqual({});
  });

  it('keeps the profile when its key cannot be removed, so the person can try again', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    jest.spyOn(services.secrets, 'remove').mockRejectedValue(new Error('keystore unavailable'));
    await expect(services.providers.remove(created.id)).rejects.toThrow();
    // The key goes first: a failure leaves the profile (and its key) in place.
    expect(await services.providers.get(created.id)).not.toBeNull();
  });

  it('keeps exactly one profile active', async () => {
    setup();
    const a = await services.providers.create({ ...base, label: 'A' });
    const b = await services.providers.create({ ...base, label: 'B' });
    expect((await services.providers.list()).filter((p) => p.isActive).map((p) => p.id)).toEqual([a.id]);
    await services.providers.setActive(b.id);
    expect((await services.providers.list()).filter((p) => p.isActive).map((p) => p.id)).toEqual([b.id]);
  });
});

describe('test connection', () => {
  const okBody = res(200, openaiText(JSON.stringify(validScanResult)));

  it('sends the bundled sample picture and reports success with the working mode', async () => {
    setup(okBody);
    const outcome = await services.providers.testConnection({ ...base, apiKey: KEY });
    expect(outcome).toEqual({ ok: true, outputMode: 'schema' });
    const sent = fake.calls[0]!;
    expect(sent.redirect).toBe('error');
    expect(sent.rawBody).toContain('data:image/jpeg;base64,/9j/');
    const dataUrl = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/.exec(sent.rawBody ?? '');
    expect(dataUrl?.[1]).toBe(SAMPLE_MEAL_JPEG_BASE64);
    expect(dataUrl?.[1]).not.toBe(SAMPLE_JPEG_BASE64);
  });

  it('uses the stored key only while the base URL is unchanged', async () => {
    setup(okBody);
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await services.providers.testConnection({ ...base, id: created.id });
    expect(fake.calls[0]!.headers.Authorization).toBe(`Bearer ${KEY}`);

    fake.calls.length = 0;
    await services.providers.testConnection({ ...base, id: created.id, baseUrl: URL_B });
    expect(fake.calls[0]!.url.startsWith(URL_B)).toBe(true);
    expect(fake.calls[0]!.headers.Authorization).toBeUndefined();
    expect(JSON.stringify(fake.calls)).not.toContain(KEY);
  });

  it('a typed key wins over the stored one', async () => {
    setup(okBody);
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await services.providers.testConnection({ ...base, id: created.id, apiKey: NEW_KEY });
    expect(fake.calls[0]!.headers.Authorization).toBe(`Bearer ${NEW_KEY}`);
  });

  it('works without any key (local servers)', async () => {
    setup(okBody);
    await expect(services.providers.testConnection({ ...base })).resolves.toMatchObject({ ok: true });
    expect(fake.calls[0]!.headers.Authorization).toBeUndefined();
  });

  it('refuses an insecure URL without sending anything', async () => {
    setup(okBody);
    const outcome = await services.providers.testConnection({ ...base, baseUrl: 'http://public.example.com/v1', apiKey: KEY });
    expect(outcome).toEqual({ ok: false, code: 'insecure_url' });
    expect(fake.calls).toHaveLength(0);
  });

  it('refuses a redirect, which the redirect-safe fetch reports as insecure_url, and never uses the body', async () => {
    const body = res(200, openaiText(JSON.stringify(validScanResult)), {}, { redirected: true });
    setup(body);
    const outcome = await services.providers.testConnection({ ...base, apiKey: KEY });
    expect(outcome).toEqual({ ok: false, code: 'insecure_url' });
  });

  it('leaks the key neither in the outcome, nor in a thrown error, nor in any log, even if the provider echoes it', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => jest.spyOn(console, level).mockImplementation(() => undefined));
    const echo = res(401, openaiError(`Incorrect API key provided: ${KEY}. Bearer ${KEY}`, 'invalid_request_error', 'invalid_api_key'));
    for (const responder of [echo, new Error(`connect ECONNREFUSED while sending Bearer ${KEY}`)] as Responder[]) {
      setup(responder);
      const outcome = await services.providers.testConnection({ ...base, apiKey: KEY });
      expect(outcome.ok).toBe(false);
      expect(JSON.stringify(outcome)).not.toContain(KEY);
    }
    const created = await services.providers.create({ ...base, apiKey: KEY });
    const failure = await services.scan
      .analyze({ imageJpegBase64: SAMPLE_JPEG_BASE64, locale: 'en', signal: new AbortController().signal })
      .catch((e: unknown) => e as Error);
    expect(created.id).toBeTruthy();
    expect(String(failure)).not.toContain(KEY);
    expect(JSON.stringify(failure, Object.getOwnPropertyNames(failure))).not.toContain(KEY);
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(KEY);
  });

  it('lists models for suggestions, and says so when the provider has no listing or fails', async () => {
    setup(res(200, { data: [{ id: 'model-a' }, { id: 'model-b' }] }));
    await expect(services.providers.listModels({ ...base, apiKey: KEY })).resolves.toEqual(['model-a', 'model-b']);
    setup(new Error('Network request failed'));
    await expect(services.providers.listModels({ ...base, apiKey: KEY })).resolves.toBeNull();
  });
});

describe('scan gateway (S4)', () => {
  it('analyzes with the active profile and its stored key, through the redirect-safe fetch', async () => {
    setup(res(200, openaiText(JSON.stringify(validScanResult))));
    const a = await services.providers.create({ ...base, label: 'A', apiKey: KEY, outputMode: 'schema' });
    const out = await services.scan.analyze({ imageJpegBase64: SAMPLE_JPEG_BASE64, locale: 'es', signal: new AbortController().signal });
    expect(out.result.is_food).toBe(true);
    expect(fake.calls[0]!.url).toBe(`${URL_A}/chat/completions`);
    expect(fake.calls[0]!.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(fake.calls[0]!.redirect).toBe('error');
    expect(fake.calls[0]!.body?.model).toBe('whatever-model');
    expect(a.isActive).toBe(true);
  });

  it('says there is nothing to analyze with when no profile is active', async () => {
    setup();
    await expect(services.scan.analyze({ imageJpegBase64: SAMPLE_JPEG_BASE64, locale: 'en', signal: new AbortController().signal })).rejects.toBeInstanceOf(ScanSetupError);
    expect(fake.calls).toHaveLength(0);
  });

  it('records the one-time notice per profile', async () => {
    setup();
    const a = await services.providers.create({ ...base, label: 'A' });
    const b = await services.providers.create({ ...base, label: 'B' });
    expect(await services.scan.noticeAcknowledged(a.id)).toBe(false);
    await services.scan.acknowledgeNotice(a.id);
    expect(await services.scan.noticeAcknowledged(a.id)).toBe(true);
    expect(await services.scan.noticeAcknowledged(b.id)).toBe(false);
  });

  it('exposes the active profile without a key', async () => {
    setup();
    expect(await services.scan.activeProvider()).toBeNull();
    const a = await services.providers.create({ ...base, apiKey: KEY });
    const active = await services.scan.activeProvider();
    expect(active?.id).toBe(a.id);
    expect(JSON.stringify(active)).not.toContain(KEY);
  });
});
