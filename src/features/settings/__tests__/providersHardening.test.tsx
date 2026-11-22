import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { fakeFetch, openaiText, res, validScanResult } from '@/core/ai/__fixtures__/fixtures';
import type { Responder } from '@/core/ai/__fixtures__/fixtures';
import type { HttpResponse } from '@/core/ai/types';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { ProviderFormScreen } from '../ProviderFormScreen';

const KEY = 'sk-HARDUI-abcdef0123456789';
const OK = res(200, openaiText(JSON.stringify(validScanResult)));
const base = { label: 'Mine', preset: null, adapter: 'openai_compatible' as const, baseUrl: 'https://llm.example.test/v1', model: 'm-1', timeoutS: 30 };

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let fake: ReturnType<typeof fakeFetch>;
function setup(...responders: Responder[]) {
  fake = fakeFetch(...(responders.length ? responders : [new Error('Network request failed')]));
  services = createTestServices(h, { fetch: fake.fetch });
}
beforeEach(async () => {
  h = await createHarness();
  setup();
});
afterEach(async () => {
  await cleanup();
  services.close();
  h.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

const t = (key: string, options: Record<string, unknown> = {}): string => String(i18n.t(key, options as never));
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);
const treeText = () => JSON.stringify(screen.toJSON());

/** A response the test releases by hand, ignoring the abort signal the way a late network answer would. */
function deferred(body: HttpResponse) {
  const signals: (AbortSignal | undefined)[] = [];
  let release!: () => void;
  const responder: Responder = (_call, signal) => {
    signals.push(signal);
    return new Promise<HttpResponse>((resolve) => (release = () => resolve(body)));
  };
  return { responder, signals, release: () => release() };
}

async function openNew(presetId = 'custom', onDone = jest.fn()) {
  await renderApp(<ProviderFormScreen presetId={presetId} onBack={jest.fn()} onDone={onDone} />, { services });
  await screen.findByLabelText('Base URL');
  return onDone;
}
async function openEdit(id: string, onDone = jest.fn()) {
  await renderApp(<ProviderFormScreen providerId={id} onBack={jest.fn()} onDone={onDone} />, { services });
  await screen.findByLabelText('Base URL');
  return onDone;
}
async function fillCustom() {
  await type('Name', 'Mine');
  await type('Base URL', 'https://llm.example.test/v1');
  await type('Model', 'm-1');
}

describe('stale responses are discarded and requests aborted (finding 4)', () => {
  it('drops a test result that arrives after the model was edited, aborts it, and never keeps it', async () => {
    const late = deferred(OK);
    setup(late.responder);
    const onDone = await openNew();
    await fillCustom();
    await press(t('providers.form.test'));
    await waitFor(() => expect(late.signals).toHaveLength(1));
    await type('Model', 'another-model');
    expect(late.signals[0]?.aborted).toBe(true);
    late.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(t('providers.test.result.ok'))).toBeNull();
    expect(screen.getByRole('button', { name: t('providers.form.test') })).toBeEnabled();
    await press(t('providers.form.save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect((await services.providers.list())[0]).toMatchObject({ model: 'another-model', lastTestResult: null, outputMode: null });
  });

  it.each([
    ['URL', 'Base URL', 'https://elsewhere.example.test/v1'],
    ['key', 'API key', KEY],
  ])('drops a test result that arrives after the %s was edited', async (_name, field, value) => {
    const late = deferred(OK);
    setup(late.responder);
    await openNew();
    await fillCustom();
    await press(t('providers.form.test'));
    await waitFor(() => expect(late.signals).toHaveLength(1));
    await type(field, value);
    expect(late.signals[0]?.aborted).toBe(true);
    late.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(t('providers.test.result.ok'))).toBeNull();
  });

  it('drops a model list that arrives after the URL was edited', async () => {
    const late = deferred(res(200, { data: [{ id: 'stale-model' }] }));
    setup(late.responder);
    await openNew();
    await type('Base URL', 'https://llm.example.test/v1');
    await press(t('providers.form.findModels'));
    await waitFor(() => expect(late.signals).toHaveLength(1));
    await type('Base URL', 'https://elsewhere.example.test/v1');
    expect(late.signals[0]?.aborted).toBe(true);
    late.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('radio', { name: 'stale-model' })).toBeNull();
  });

  it('aborts in-flight requests when the screen goes away', async () => {
    const late = deferred(OK);
    setup(late.responder);
    await openNew();
    await fillCustom();
    await press(t('providers.form.test'));
    await waitFor(() => expect(late.signals).toHaveLength(1));
    await screen.unmount();
    expect(late.signals[0]?.aborted).toBe(true);
  });
});

describe('a storage problem is its own message (finding 5)', () => {
  it('says so, in both languages, instead of "invalid key"', async () => {
    const created = await services.providers.create({ ...base, apiKey: KEY });
    jest.spyOn(services.secrets, 'get').mockRejectedValue(new Error('keystore'));
    await openEdit(created.id);
    await press(t('providers.form.test'));
    expect(await screen.findByText(t('providers.test.result.key_storage'))).toBeOnTheScreen();
    expect(screen.queryByText(t('providers.test.result.auth_invalid'))).toBeNull();
    const en = t('providers.test.result.key_storage');
    const es = i18n.t('providers.test.result.key_storage', { lng: 'es' });
    expect(es).not.toBe(en);
    expect(en).not.toMatch(/^providers\./);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('the form shows the real state of the key (finding 2)', () => {
  it('does not say a key is saved after the old one was removed and the new one could not be stored', async () => {
    const created = await services.providers.create({ ...base, apiKey: KEY });
    jest.spyOn(services.secrets, 'set').mockRejectedValue(new Error('keystore'));
    const onDone = await openEdit(created.id);
    expect(screen.getByText(t('providers.key.saved'))).toBeOnTheScreen();
    await type('Base URL', 'https://other.example.test/v1');
    await type('API key', 'sk-NEWONE-0123456789abcdef');
    await press(t('providers.form.save'));
    expect(await screen.findByText(t('providers.key.storeFailedSaved'))).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(t('providers.key.saved'))).toBeNull());
    expect(screen.queryByRole('button', { name: t('providers.form.removeKey') })).toBeNull();
    expect(screen.queryByText(t('providers.key.willClear'))).toBeNull();
    expect(await services.providers.get(created.id)).toMatchObject({ baseUrl: 'https://other.example.test/v1', hasKey: false });
  });
});

describe('a create that half worked (finding 3)', () => {
  it('turns the form into an edit of the profile that exists, so a retry does not duplicate it', async () => {
    jest.spyOn(services.secrets, 'set').mockRejectedValueOnce(new Error('keystore'));
    jest.spyOn(h.repos.aiProviders, 'remove').mockRejectedValueOnce(new Error('disk'));
    const onDone = await openNew();
    await fillCustom();
    await type('API key', KEY);
    await press(t('providers.form.save'));
    expect(await screen.findByText(t('providers.key.storeFailedSaved'))).toBeOnTheScreen();
    expect(await services.providers.list()).toHaveLength(1);
    await type('API key', KEY);
    await press(t('providers.form.save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const list = await services.providers.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ hasKey: true });
  });

  it('says the profile was saved when only the test result could not be kept', async () => {
    setup(OK);
    jest.spyOn(h.repos.aiProviders, 'recordTest').mockRejectedValue(new Error('disk'));
    const onDone = await openNew();
    await fillCustom();
    await press(t('providers.form.test'));
    await screen.findByText(t('providers.test.result.ok'));
    await press(t('providers.form.save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await screen.findByText(t('providers.form.savedNoTest'))).toBeOnTheScreen();
    expect(screen.queryByText(t('providers.form.saveFailed'))).toBeNull();
    expect(await services.providers.list()).toHaveLength(1);
  });
});

describe('the first provider becomes active, and the form says so (finding 7)', () => {
  it('tells the person at creation that the first provider will be active and receive scanned photos', async () => {
    await openNew();
    expect(await screen.findByText(t('providers.form.firstActive'))).toBeOnTheScreen();
  });

  it('does not say it when another provider already exists', async () => {
    await services.providers.create({ ...base, label: 'Existing' });
    await openNew();
    await waitFor(() => expect(screen.queryByText(t('providers.form.firstActive'))).toBeNull());
  });

  it('says it in Spanish too, and the first provider really is active', async () => {
    expect(i18n.t('providers.form.firstActive', { lng: 'es' })).not.toBe(t('providers.form.firstActive'));
    const onDone = await openNew();
    await fillCustom();
    await press(t('providers.form.save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect((await services.providers.list())[0]?.isActive).toBe(true);
    expect(treeText()).not.toContain(KEY);
  });
});
