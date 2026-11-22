import { isDataError } from '../errors';
import { createHarness, type Harness } from '../testing/harness';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const base = { providerId: null, providerLabel: 'Gemini', model: 'gemini-x', promptVersion: 2 };

describe('scan repository (docs/08 `scan`: one row per analysis request, failures included)', () => {
  it('records a successful scan with the provider label and model copied, tokens, latency and the result', async () => {
    const provider = await h.repos.aiProviders.create({
      label: 'Gemini',
      preset: null,
      adapter: 'gemini',
      baseUrl: 'https://gem.example.test',
      model: 'gemini-x',
      timeoutS: 30,
    });
    const row = await h.repos.scans.record({
      ...base,
      providerId: provider.id,
      status: 'ok',
      hint: 'rice is 200 g',
      resultJson: '{"is_food":true}',
      inputTokens: 812,
      outputTokens: 240,
      latencyMs: 1500,
      repaired: true,
    });
    expect(await h.repos.scans.get(row.id)).toEqual(row);
    expect(row).toMatchObject({
      providerId: provider.id,
      providerLabel: 'Gemini',
      model: 'gemini-x',
      promptVersion: '2',
      status: 'ok',
      errorCode: null,
      hint: 'rice is 200 g',
      resultJson: '{"is_food":true}',
      inputTokens: 812,
      outputTokens: 240,
      latencyMs: 1500,
      repaired: 1,
    });
  });

  it('records a failure with its code and without a result', async () => {
    const row = await h.repos.scans.record({ ...base, status: 'error', errorCode: 'quota_exceeded' });
    expect(row).toMatchObject({ status: 'error', errorCode: 'quota_exceeded', resultJson: null, repaired: 0, inputTokens: null, latencyMs: null });
  });

  it('keeps the row, with its copied label, when the profile is deleted later', async () => {
    const provider = await h.repos.aiProviders.create({ label: 'Mine', preset: null, adapter: 'gemini', baseUrl: 'https://g.example.test', model: 'm', timeoutS: 30 });
    const row = await h.repos.scans.record({ ...base, providerId: provider.id, providerLabel: 'Mine', status: 'ok' });
    await h.repos.aiProviders.remove(provider.id);
    expect(await h.repos.scans.get(row.id)).toMatchObject({ providerId: null, providerLabel: 'Mine' });
  });

  it('still records the attempt when the profile row is already gone', async () => {
    const row = await h.repos.scans.record({ ...base, providerId: 'deleted-profile', status: 'error', errorCode: 'provider_changed' });
    expect(row.providerId).toBeNull();
  });

  it('lists the newest first and returns null for an unknown id', async () => {
    const a = await h.repos.scans.record({ ...base, status: 'ok' });
    h.setNow('2026-06-15T12:05:00.000Z');
    const b = await h.repos.scans.record({ ...base, status: 'no_food' });
    expect((await h.repos.scans.list()).map((s) => s.id)).toEqual([b.id, a.id]);
    expect(await h.repos.scans.get('nope')).toBeNull();
  });

  it('rejects an unknown status', async () => {
    const failure = await h.repos.scans.record({ ...base, status: 'weird' as 'ok' }).then(() => null, (e: unknown) => e);
    expect(isDataError(failure, 'invalid_input')).toBe(true);
  });
});
