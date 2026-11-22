import { SAMPLE_JPEG_BASE64, fakeFetch, res } from '@/core/ai/__fixtures__/fixtures';
import { createHarness, type Harness } from '@/data/testing/harness';
import { createTestServices } from '../../testing/testServices';
import { ProviderNotConfirmedError, importedKey } from '../providerService';

void SAMPLE_JPEG_BASE64;
void res;
const base = { label: 'Imported', preset: null, adapter: 'openai_compatible' as const, baseUrl: 'https://llm.example.test/v1', model: 'm', timeoutS: 30 };

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let fake: ReturnType<typeof fakeFetch>;
beforeEach(async () => {
  h = await createHarness();
  fake = fakeFetch(new Error('Network request failed'));
  services = createTestServices(h, { fetch: fake.fetch });
});
afterEach(() => {
  services.close();
  h.close();
});

const draftOf = (provider: { id: string }) => ({ id: provider.id, adapter: base.adapter, baseUrl: base.baseUrl, model: base.model, timeoutS: base.timeoutS });

describe('an imported, unconfirmed profile reaches no network until it is confirmed (A6)', () => {
  it('testConnection refuses with no key typed, and nothing is sent', async () => {
    const created = await services.providers.create(base);
    await h.repos.settings.set(importedKey(created.id), '1');
    await expect(services.providers.testConnection(draftOf(created))).rejects.toBeInstanceOf(ProviderNotConfirmedError);
    expect(fake.calls).toHaveLength(0);
  });

  it('listModels refuses with no key typed, and nothing is sent', async () => {
    const created = await services.providers.create(base);
    await h.repos.settings.set(importedKey(created.id), '1');
    await expect(services.providers.listModels(draftOf(created))).rejects.toBeInstanceOf(ProviderNotConfirmedError);
    expect(fake.calls).toHaveLength(0);
  });

  it('refuses even when the draft points somewhere else than the imported profile', async () => {
    const created = await services.providers.create(base);
    await h.repos.settings.set(importedKey(created.id), '1');
    await expect(services.providers.testConnection({ ...draftOf(created), baseUrl: 'https://elsewhere.example.test/v1' })).rejects.toBeInstanceOf(ProviderNotConfirmedError);
    expect(fake.calls).toHaveLength(0);
  });

  it('works as before once the profile is confirmed, and for a profile that was never imported', async () => {
    const created = await services.providers.create(base);
    await h.repos.settings.set(importedKey(created.id), '1');
    await services.providers.confirmImported(created.id);
    await expect(services.providers.testConnection(draftOf(created))).resolves.toMatchObject({ ok: false });
    expect(fake.calls.length).toBeGreaterThan(0);
    const fresh = await services.providers.create({ ...base, label: 'Own' });
    await expect(services.providers.listModels(draftOf(fresh))).resolves.toBeNull();
  });

  it('a draft with no profile id (a new form) is not an imported profile', async () => {
    await expect(services.providers.testConnection({ adapter: base.adapter, baseUrl: base.baseUrl, model: 'm', timeoutS: 30 })).resolves.toMatchObject({ ok: false });
  });
});
