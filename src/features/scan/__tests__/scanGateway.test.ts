import { SAMPLE_JPEG_BASE64, fakeFetch, openaiText, res, validScanResult } from '@/core/ai/__fixtures__/fixtures';
import { createHarness, type Harness } from '@/data/testing/harness';
import { createMemorySecretStore } from '@/platform/memorySecretStore';
import { SecretStoreError } from '@/platform/secretStore';
import { createAiClient } from '../../settings/aiClient';
import { createScanGateway, ScanSetupError } from '../scanGateway';

const KEY = 'sk-GATEWAY-0123456789abcdef';
let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const input = () => ({ imageJpegBase64: SAMPLE_JPEG_BASE64, locale: 'en' as const, signal: new AbortController().signal });
const profile = { label: 'P', preset: null, adapter: 'openai_compatible' as const, baseUrl: 'https://a.example.test/v1', model: 'm', timeoutS: 30 };

function gateway() {
  const fake = fakeFetch(res(200, openaiText(JSON.stringify(validScanResult))));
  const vault = createMemorySecretStore();
  const gw = createScanGateway({
    aiProviders: h.repos.aiProviders,
    settings: h.repos.settings,
    secrets: vault,
    client: createAiClient({ fetch: fake.fetch, retryDelayMs: 0 }),
  });
  return { gw, fake, vault };
}

describe('scan gateway', () => {
  it('rejects with ScanSetupError and sends nothing when no profile is active', async () => {
    const { gw, fake } = gateway();
    await expect(gw.analyze(input())).rejects.toBeInstanceOf(ScanSetupError);
    expect(fake.calls).toHaveLength(0);
    expect(await gw.activeProvider()).toBeNull();
  });

  it('sends the stored key to the active profile and nowhere else', async () => {
    const { gw, fake, vault } = gateway();
    const a = await h.repos.aiProviders.create(profile);
    await vault.set(a.id, KEY);
    await gw.analyze(input());
    expect(fake.calls[0]!.url.startsWith('https://a.example.test/v1')).toBe(true);
    expect(fake.calls[0]!.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it('fails without sending anything when the secret store throws, and the error does not carry the cause', async () => {
    const { gw, fake, vault } = gateway();
    const a = await h.repos.aiProviders.create(profile);
    await vault.set(a.id, KEY);
    jest.spyOn(vault, 'get').mockRejectedValue(new Error(`keystore failed for ${KEY}`));
    const failure = await gw.analyze(input()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(SecretStoreError);
    expect(String(failure)).not.toContain(KEY);
    expect(fake.calls).toHaveLength(0);
  });

  it('refuses when the profile changed between reading it and reading its key', async () => {
    const { gw, fake, vault } = gateway();
    const a = await h.repos.aiProviders.create(profile);
    await vault.set(a.id, KEY);
    const realGet = vault.get.bind(vault);
    jest.spyOn(vault, 'get').mockImplementation(async (id) => {
      await h.repos.aiProviders.update(id, { baseUrl: 'https://b.example.test/v1' });
      return realGet(id);
    });
    await expect(gw.analyze(input())).rejects.toBeInstanceOf(ScanSetupError);
    expect(fake.calls).toHaveLength(0);
  });

  it('refuses when the profile was deleted while its key was being read', async () => {
    const { gw, fake, vault } = gateway();
    const a = await h.repos.aiProviders.create(profile);
    await vault.set(a.id, KEY);
    const realGet = vault.get.bind(vault);
    jest.spyOn(vault, 'get').mockImplementation(async (id) => {
      await h.repos.aiProviders.remove(id);
      return realGet(id);
    });
    await expect(gw.analyze(input())).rejects.toBeInstanceOf(ScanSetupError);
    expect(fake.calls).toHaveLength(0);
  });

  it('records the one-time notice per profile', async () => {
    const { gw } = gateway();
    const a = await h.repos.aiProviders.create(profile);
    const b = await h.repos.aiProviders.create(profile);
    await gw.acknowledgeNotice(a.id);
    expect(await gw.noticeAcknowledged(a.id)).toBe(true);
    expect(await gw.noticeAcknowledged(b.id)).toBe(false);
  });
});
