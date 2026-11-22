import { isDataError } from '../errors';
import { createHarness, type Harness } from '../testing/harness';
import type { AiProviderInput } from '../repositories';

const expectCode = async (promise: Promise<unknown>, code: Parameters<typeof isDataError>[1]) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(isDataError(error, code)).toBe(true);
};

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const input = (over: Partial<AiProviderInput> = {}): AiProviderInput => ({
  label: 'Mine',
  preset: null,
  adapter: 'openai_compatible',
  baseUrl: 'https://llm.example.test/v1',
  model: 'any-model:7b',
  timeoutS: 60,
  ...over,
});

describe('ai provider repository', () => {
  it('creates, reads back and lists profiles', async () => {
    const a = await h.repos.aiProviders.create(input({ label: 'A' }));
    const b = await h.repos.aiProviders.create(input({ label: 'B', preset: 'gemini', adapter: 'gemini' }));
    expect(await h.repos.aiProviders.get(a.id)).toEqual(a);
    expect((await h.repos.aiProviders.list()).map((p) => p.label).sort()).toEqual(['A', 'B']);
    expect(b.preset).toBe('gemini');
    expect(a.outputMode).toBeNull();
    expect(a.lastTestAt).toBeNull();
  });

  it('makes the first profile active and leaves later ones inactive', async () => {
    const a = await h.repos.aiProviders.create(input({ label: 'A' }));
    const b = await h.repos.aiProviders.create(input({ label: 'B' }));
    expect(a.isActive).toBe(true);
    expect(b.isActive).toBe(false);
  });

  it('keeps exactly one active profile when the active one changes', async () => {
    const a = await h.repos.aiProviders.create(input({ label: 'A' }));
    const b = await h.repos.aiProviders.create(input({ label: 'B' }));
    const c = await h.repos.aiProviders.create(input({ label: 'C' }));
    await h.repos.aiProviders.setActive(b.id);
    expect((await h.repos.aiProviders.list()).filter((p) => p.isActive).map((p) => p.id)).toEqual([b.id]);
    await h.repos.aiProviders.setActive(c.id);
    expect((await h.repos.aiProviders.list()).filter((p) => p.isActive).map((p) => p.id)).toEqual([c.id]);
    expect((await h.repos.aiProviders.getActive())?.id).toBe(c.id);
    expect(a.id).not.toBe(c.id);
  });

  it('refuses to activate an unknown profile and leaves the active one alone', async () => {
    const a = await h.repos.aiProviders.create(input());
    await expectCode(h.repos.aiProviders.setActive('nope'), 'not_found');
    expect((await h.repos.aiProviders.getActive())?.id).toBe(a.id);
  });

  it('updates fields and forgets the old test result when the destination or model changes', async () => {
    const a = await h.repos.aiProviders.create(input());
    await h.repos.aiProviders.recordTest(a.id, { result: 'ok', outputMode: 'schema' });
    const same = await h.repos.aiProviders.update(a.id, { label: 'Renamed', timeoutS: 90 });
    expect(same).toMatchObject({ label: 'Renamed', timeoutS: 90, outputMode: 'schema', lastTestResult: 'ok' });
    const moved = await h.repos.aiProviders.update(a.id, { model: 'other' });
    expect(moved).toMatchObject({ model: 'other', outputMode: null, lastTestAt: null, lastTestResult: null });
  });

  it('stores the output mode and the last test result', async () => {
    const a = await h.repos.aiProviders.create(input());
    const saved = await h.repos.aiProviders.recordTest(a.id, { result: 'auth_invalid', outputMode: null });
    expect(saved.lastTestResult).toBe('auth_invalid');
    expect(saved.lastTestAt).toBe('2026-06-15T12:00:00.000Z');
    const ok = await h.repos.aiProviders.recordTest(a.id, { result: 'ok', outputMode: 'tool' });
    expect(ok).toMatchObject({ outputMode: 'tool', lastTestResult: 'ok' });
  });

  it('removes a profile, and nothing is active afterwards if it was the active one', async () => {
    const a = await h.repos.aiProviders.create(input({ label: 'A' }));
    await h.repos.aiProviders.create(input({ label: 'B' }));
    await h.repos.aiProviders.remove(a.id);
    expect(await h.repos.aiProviders.get(a.id)).toBeNull();
    expect(await h.repos.aiProviders.getActive()).toBeNull();
    await expect(h.repos.aiProviders.remove(a.id)).resolves.toBeUndefined();
  });

  it('rejects empty labels, base URLs and models, and silly timeouts', async () => {
    await expectCode(h.repos.aiProviders.create(input({ label: '  ' })), 'invalid_input');
    await expectCode(h.repos.aiProviders.create(input({ baseUrl: '' })), 'invalid_input');
    await expectCode(h.repos.aiProviders.create(input({ model: '' })), 'invalid_input');
    await expectCode(h.repos.aiProviders.create(input({ timeoutS: 0 })), 'invalid_input');
    await expectCode(h.repos.aiProviders.create(input({ timeoutS: 1.5 })), 'invalid_input');
    expect(await h.repos.aiProviders.list()).toEqual([]);
  });

  it('has no column that could hold a key', () => {
    const columns = h.client.prepare("SELECT name FROM pragma_table_info('ai_provider')").all().map((r) => String(r.name));
    expect(columns.sort()).toEqual(
      ['adapter', 'base_url', 'id', 'is_active', 'label', 'last_test_at', 'last_test_result', 'model', 'output_mode', 'preset', 'timeout_s'].sort(),
    );
  });
});
