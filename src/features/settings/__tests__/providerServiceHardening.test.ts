import { SAMPLE_JPEG_BASE64, fakeFetch, openaiText, res, validScanResult } from '@/core/ai/__fixtures__/fixtures';
import type { Responder } from '@/core/ai/__fixtures__/fixtures';
import { createHarness, type Harness } from '@/data/testing/harness';
import { SecretStoreError } from '@/platform/secretStore';
import { createTestServices } from '../../testing/testServices';
import { ProviderSaveError } from '../providerService';

const KEY = 'sk-HARDEN-abcdef0123456789';
const NEW_KEY = 'sk-HARDEN2-zyxwvu9876543210';
const URL_A = 'https://llm.example.test/v1';
const URL_B = 'https://other.example.test/v1';
const base = { label: 'Mine', preset: null, adapter: 'openai_compatible' as const, baseUrl: URL_A, model: 'm', timeoutS: 30 };
const scanInput = () => ({ imageJpegBase64: SAMPLE_JPEG_BASE64, locale: 'en' as const, signal: new AbortController().signal });

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let open = false;
let fake: ReturnType<typeof fakeFetch>;
function setup(...responders: Responder[]) {
  if (open) services.close();
  fake = fakeFetch(...(responders.length ? responders : [new Error('Network request failed')]));
  services = createTestServices(h, { fetch: fake.fetch });
  open = true;
}
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => {
  if (open) services.close();
  open = false;
  h.close();
  jest.restoreAllMocks();
});

describe('ordering of key and row (finding 1)', () => {
  it('removes the key, updates the row, and only then stores the new key', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    const order: string[] = [];
    const update = h.repos.aiProviders.update.bind(h.repos.aiProviders);
    jest.spyOn(h.repos.aiProviders, 'update').mockImplementation(async (...args) => {
      order.push('row');
      return update(...args);
    });
    const set = services.secrets.set.bind(services.secrets);
    jest.spyOn(services.secrets, 'set').mockImplementation(async (...args) => {
      order.push('set');
      return set(...args);
    });
    const remove = services.secrets.remove.bind(services.secrets);
    jest.spyOn(services.secrets, 'remove').mockImplementation(async (...args) => {
      order.push('remove');
      return remove(...args);
    });
    await services.providers.update(created.id, { baseUrl: URL_B, apiKey: NEW_KEY });
    expect(order).toEqual(['remove', 'row', 'set']);
    expect(await services.secrets.get(created.id)).toBe(NEW_KEY);
  });

  it('if the row update fails, the new key is stored nowhere and the old URL has no key', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    jest.spyOn(h.repos.aiProviders, 'update').mockRejectedValue(new Error('disk full'));
    await expect(services.providers.update(created.id, { baseUrl: URL_B, apiKey: NEW_KEY })).rejects.toThrow();
    expect((await services.providers.get(created.id))?.baseUrl).toBe(URL_A);
    expect(await services.secrets.get(created.id)).toBeNull();
  });

  it('if storing the new key fails after the row moved, the profile has the new URL and no key', async () => {
    setup();
    const created = await services.providers.create({ ...base, apiKey: KEY });
    jest.spyOn(services.secrets, 'set').mockRejectedValue(new Error('keystore'));
    await expect(services.providers.update(created.id, { baseUrl: URL_B, apiKey: NEW_KEY })).rejects.toBeInstanceOf(SecretStoreError);
    expect(await services.providers.get(created.id)).toMatchObject({ baseUrl: URL_B, hasKey: false });
  });

  it('a scan racing an update never sends the new host\'s key to the old host', async () => {
    setup(res(200, openaiText(JSON.stringify(validScanResult))));
    const created = await services.providers.create({ ...base, apiKey: KEY });
    const realGet = services.secrets.get.bind(services.secrets);
    // The scan has read the profile (URL_A) and is reading the key when a complete update lands.
    jest.spyOn(services.secrets, 'get').mockImplementationOnce(async (id) => {
      await services.providers.update(id, { baseUrl: URL_B, apiKey: NEW_KEY });
      return realGet(id);
    });
    const failure = await services.scan.analyze(scanInput()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(fake.calls).toHaveLength(0);
    expect(created.id).toBeTruthy();
  });
});

describe('a scan racing two updates (A, then B, then A again)', () => {
  it('does not send the key entered for B to A', async () => {
    setup(res(200, openaiText(JSON.stringify(validScanResult))));
    const created = await services.providers.create({ ...base, apiKey: KEY });
    const realGet = services.secrets.get.bind(services.secrets);
    const realProfile = h.repos.aiProviders.get.bind(h.repos.aiProviders);
    jest.spyOn(services.secrets, 'get').mockImplementationOnce(async (id) => {
      await services.providers.update(id, { baseUrl: URL_B, apiKey: NEW_KEY });
      const keyForB = await realGet(id);
      // Before the gateway looks at the profile again, the URL goes back to A with another key.
      jest.spyOn(h.repos.aiProviders, 'get').mockImplementationOnce(async (profileId) => {
        await services.providers.update(profileId, { baseUrl: URL_A, apiKey: 'sk-THIRD-0123456789abcdef' });
        return realProfile(profileId);
      });
      return keyForB;
    });
    await expect(services.scan.analyze(scanInput())).rejects.toBeInstanceOf(Error);
    expect(fake.calls).toHaveLength(0);
    expect(created.id).toBeTruthy();
  });
});

describe('create when storage misbehaves (finding 3)', () => {
  it('cleans up a partially written key and the row when the key cannot be stored', async () => {
    setup();
    const removed: string[] = [];
    jest.spyOn(services.secrets, 'set').mockRejectedValue(new Error('half written'));
    const remove = services.secrets.remove.bind(services.secrets);
    jest.spyOn(services.secrets, 'remove').mockImplementation(async (id) => {
      removed.push(id);
      return remove(id);
    });
    await expect(services.providers.create({ ...base, apiKey: KEY })).rejects.toBeInstanceOf(SecretStoreError);
    expect(removed).toHaveLength(1);
    expect(await services.providers.list()).toEqual([]);
  });

  it('when the row cannot be removed either, says it exists without its key, and a retry updates it instead of duplicating', async () => {
    setup();
    jest.spyOn(services.secrets, 'set').mockRejectedValueOnce(new Error('keystore'));
    jest.spyOn(h.repos.aiProviders, 'remove').mockRejectedValueOnce(new Error('disk'));
    const failure = await services.providers.create({ ...base, apiKey: KEY }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProviderSaveError);
    const { provider, code } = failure as ProviderSaveError;
    expect(code).toBe('key_failed');
    expect(provider).toMatchObject({ hasKey: false, label: 'Mine' });
    expect(await services.providers.list()).toHaveLength(1);
    await services.providers.update(provider!.id, { apiKey: KEY });
    expect(await services.providers.list()).toHaveLength(1);
    expect(await services.secrets.get(provider!.id)).toBe(KEY);
  });

  it('a failure recording the test result after a successful save is not a failed save', async () => {
    setup();
    jest.spyOn(h.repos.aiProviders, 'recordTest').mockRejectedValue(new Error('disk'));
    const created = await services.providers.create({ ...base, apiKey: KEY, test: { ok: true, outputMode: 'schema' } });
    expect(created).toMatchObject({ hasKey: true, testRecorded: false });
    expect(await services.secrets.get(created.id)).toBe(KEY);
    const updated = await services.providers.update(created.id, { label: 'Again', test: { ok: true, outputMode: 'schema' } });
    expect(updated).toMatchObject({ label: 'Again', testRecorded: false });
  });
});

describe('storage problems are not "invalid key" (finding 5)', () => {
  it('reports a secret-store failure on test connection as key_storage and sends nothing', async () => {
    setup(res(200, openaiText(JSON.stringify(validScanResult))));
    const created = await services.providers.create({ ...base, apiKey: KEY });
    jest.spyOn(services.secrets, 'get').mockRejectedValue(new Error(`keystore ${KEY}`));
    expect(await services.providers.testConnection({ ...base, id: created.id })).toEqual({ ok: false, code: 'key_storage' });
    expect(fake.calls).toHaveLength(0);
  });

  it('lets a model-list request fail with a SecretStoreError rather than listing without the key', async () => {
    setup(res(200, { data: [{ id: 'a' }] }));
    const created = await services.providers.create({ ...base, apiKey: KEY });
    jest.spyOn(services.secrets, 'get').mockRejectedValue(new Error('keystore'));
    await expect(services.providers.listModels({ ...base, id: created.id })).rejects.toBeInstanceOf(SecretStoreError);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('the redirect-safe wrapper is really in the wiring (finding 9)', () => {
  it.each([301, 302, 303, 307, 308])('refuses a %i that carries no redirected flag, for a test and for a scan', async (status) => {
    setup(res(status, '', { location: 'https://evil.example.net/v1/chat/completions' }));
    const created = await services.providers.create({ ...base, apiKey: KEY });
    expect(await services.providers.testConnection({ ...base, id: created.id })).toEqual({ ok: false, code: 'insecure_url' });
    const failure = await services.scan.analyze(scanInput()).catch((e: unknown) => e);
    expect((failure as { code?: string }).code).toBe('insecure_url');
  });
});
