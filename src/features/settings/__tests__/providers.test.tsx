import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { openaiError, openaiText, fakeFetch, res, validScanResult } from '@/core/ai/__fixtures__/fixtures';
import type { Responder } from '@/core/ai/__fixtures__/fixtures';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { getPreset, PRESETS } from '../presets';
import { ProviderFormScreen } from '../ProviderFormScreen';
import { ProviderPresetsScreen } from '../ProviderPresetsScreen';
import { ProvidersScreen } from '../ProvidersScreen';
import { SettingsScreen } from '../SettingsScreen';

const KEY = 'sk-UIKEY-abcdef0123456789';
const OK = res(200, openaiText(JSON.stringify(validScanResult)));

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

const base = { label: 'Mine', preset: null, adapter: 'openai_compatible' as const, baseUrl: 'https://llm.example.test/v1', model: 'm-1', timeoutS: 30 };

async function openNewForm(presetId: string, extra: { onDone?: jest.Mock } = {}) {
  const onDone = extra.onDone ?? jest.fn();
  await renderApp(<ProviderFormScreen presetId={presetId} onBack={jest.fn()} onDone={onDone} />, { services });
  await screen.findByLabelText('Base URL');
  return onDone;
}

async function openEditForm(id: string, onDone = jest.fn()) {
  await renderApp(<ProviderFormScreen providerId={id} onBack={jest.fn()} onDone={onDone} />, { services });
  await screen.findByLabelText('Base URL');
  return onDone;
}

describe('list of providers', () => {
  it('invites the first provider when there is none', async () => {
    const onAdd = jest.fn();
    await renderApp(<ProvidersScreen onAdd={onAdd} onOpen={jest.fn()} onBack={jest.fn()} />, { services });
    expect(await screen.findByText(t('providers.list.empty.title'))).toBeOnTheScreen();
    await press(t('providers.add'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('shows every profile, marks the active one, and says whether a key is saved', async () => {
    const a = await services.providers.create({ ...base, label: 'Alpha', apiKey: KEY });
    await services.providers.create({ ...base, label: 'Beta' });
    const onOpen = jest.fn();
    await renderApp(<ProvidersScreen onAdd={jest.fn()} onOpen={onOpen} onBack={jest.fn()} />, { services });
    expect(await screen.findByRole('button', { name: /Alpha/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Beta/ })).toBeOnTheScreen();
    expect(screen.getAllByText(new RegExp(t('providers.active')))).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Alpha/ }).props.accessibilityHint).toContain(t('providers.active'));
    expect(screen.getByRole('button', { name: /Alpha/ }).props.accessibilityHint).toContain(t('providers.keySaved'));
    expect(screen.getByRole('button', { name: /Beta/ }).props.accessibilityHint).toContain(t('providers.noKey'));
    await fireEvent.press(screen.getByRole('button', { name: /Alpha/ }));
    expect(onOpen).toHaveBeenCalledWith(a.id);
    expect(treeText()).not.toContain(KEY);
  });

  it('says plainly that the app is not affiliated with the services it works with', async () => {
    await renderApp(<ProvidersScreen onAdd={jest.fn()} onOpen={jest.fn()} onBack={jest.fn()} />, { services });
    expect(await screen.findByText(t('providers.notAffiliated'))).toBeOnTheScreen();
  });

  it('shows an error with a way to retry when the profiles cannot be read', async () => {
    jest.spyOn(services.providers, 'list').mockRejectedValueOnce(new Error('disk'));
    await renderApp(<ProvidersScreen onAdd={jest.fn()} onOpen={jest.fn()} onBack={jest.fn()} />, { services });
    expect(await screen.findByText(t('providers.list.error'))).toBeOnTheScreen();
    await press(t('common.retry'));
    expect(await screen.findByText(t('providers.list.empty.title'))).toBeOnTheScreen();
  });
});

describe('choosing a preset', () => {
  it('lists the options with a zero-cost path first and says so, and preselects nothing', async () => {
    const onChoose = jest.fn();
    await renderApp(<ProviderPresetsScreen onChoose={onChoose} onBack={jest.fn()} />, { services });
    const free = await screen.findByText(t('providers.presets.free'));
    const paid = screen.getByText(t('providers.presets.paid'));
    const other = screen.getByText(t('providers.presets.custom'));
    const order = screen.getAllByRole('button').map((b) => String(b.props.accessibilityLabel));
    const position = (name: string) => order.findIndex((label) => label.startsWith(name));
    expect(free).toBeOnTheScreen();
    expect(paid).toBeOnTheScreen();
    expect(other).toBeOnTheScreen();
    expect(position('Google Gemini API')).toBeLessThan(position('OpenAI'));
    expect(position('OpenRouter')).toBeLessThan(position('Anthropic'));
    expect(position('Ollama')).toBeLessThan(position('OpenAI'));
    expect(position('Custom (OpenAI-compatible)')).toBeGreaterThan(position('Anthropic'));
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(onChoose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: /^Anthropic/ }));
    expect(onChoose).toHaveBeenCalledWith('anthropic');
  });

  it('shows the cost note of each preset in the picker, in the person\'s language', async () => {
    await renderApp(<ProviderPresetsScreen onChoose={jest.fn()} onBack={jest.fn()} />, { services, locale: 'es' });
    await screen.findByText(t('providers.presets.free'));
    expect(screen.getByText(getPreset('gemini')!.cost.es)).toBeOnTheScreen();
  });

  it('names the app next to provider names only as compatibility, with a not-affiliated line', async () => {
    await renderApp(<ProviderPresetsScreen onChoose={jest.fn()} onBack={jest.fn()} />, { services });
    expect(await screen.findByText(t('providers.notAffiliated'))).toBeOnTheScreen();
  });
});

describe('the form', () => {
  it('prefills the preset\'s address and name, but never a model, and shows the cost and data-use notes with the date and terms', async () => {
    const gemini = getPreset('gemini')!;
    await openNewForm('gemini');
    expect(screen.getByLabelText('Base URL').props.value).toBe(gemini.baseUrl);
    expect(screen.getByLabelText('Name').props.value).toBe(gemini.name);
    expect(screen.getByLabelText('Model').props.value).toBe('');
    expect(screen.getByText(gemini.cost.en)).toBeOnTheScreen();
    expect(screen.getByText(gemini.dataUse.en)).toBeOnTheScreen();
    expect(screen.getByText(t('providers.form.verified', { date: '2026-11-21' }))).toBeOnTheScreen();
    await press(t('providers.form.terms'));
    expect(Linking.openURL).toHaveBeenCalledWith(gemini.termsUrl);
  });

  it('shows the notes in Spanish', async () => {
    await renderApp(<ProviderFormScreen presetId="openrouter" onBack={jest.fn()} onDone={jest.fn()} />, { services, locale: 'es' });
    expect(await screen.findByText(getPreset('openrouter')!.cost.es)).toBeOnTheScreen();
    expect(screen.getByText(getPreset('openrouter')!.dataUse.es)).toBeOnTheScreen();
  });

  it('starts every preset, and a custom provider, without a model selected', async () => {
    for (const preset of PRESETS) {
      await openNewForm(preset.id);
      expect(screen.getByLabelText('Model').props.value).toBe('');
      expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
      await cleanup();
    }
  });

  it('accepts any text as the model and saves it exactly as typed', async () => {
    const onDone = await openNewForm('custom');
    await type('Name', 'My server');
    await type('Base URL', 'https://llm.example.test/v1');
    await type('Model', 'Anything/Goes:v1.2 (custom)');
    expect(screen.getByLabelText('Model').props.value).toBe('Anything/Goes:v1.2 (custom)');
    await press(t('providers.form.save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect((await services.providers.list())[0]).toMatchObject({ label: 'My server', model: 'Anything/Goes:v1.2 (custom)', preset: 'custom' });
  });

  it('offers the provider\'s model list as suggestions when it returns one, without replacing what was typed', async () => {
    setup(res(200, { data: [{ id: 'model-a' }, { id: 'model-b' }] }));
    await openNewForm('custom');
    await type('Base URL', 'https://llm.example.test/v1');
    await type('Model', 'my-own-model');
    await press(t('providers.form.findModels'));
    const suggestion = await screen.findByRole('radio', { name: 'model-b' });
    expect(screen.getByLabelText('Model').props.value).toBe('my-own-model');
    await fireEvent.press(suggestion);
    expect(screen.getByLabelText('Model').props.value).toBe('model-b');
  });

  it('keeps the field free and says so when no list could be loaded', async () => {
    await openNewForm('custom');
    await type('Base URL', 'https://llm.example.test/v1');
    await press(t('providers.form.findModels'));
    expect(await screen.findByText(t('providers.form.noModelList'))).toBeOnTheScreen();
    await type('Model', 'still-typeable');
    expect(screen.getByLabelText('Model').props.value).toBe('still-typeable');
  });

  it('rejects an insecure base URL with its own message, and neither tests nor saves', async () => {
    const onDone = await openNewForm('custom');
    await type('Name', 'X');
    await type('Base URL', 'http://public.example.com/v1');
    await type('Model', 'm');
    await press(t('providers.form.test'));
    expect(await screen.findByText(t('providers.url.insecure'))).toBeOnTheScreen();
    expect(fake.calls).toHaveLength(0);
    await press(t('providers.form.save'));
    await waitFor(() => expect(screen.getAllByText(t('providers.url.insecure')).length).toBeGreaterThan(0));
    expect(onDone).not.toHaveBeenCalled();
    expect(await services.providers.list()).toEqual([]);
  });

  it('allows plain http for a computer on the local network', async () => {
    await openNewForm('ollama');
    await type('Base URL', 'http://192.168.1.20:11434/v1');
    await type('Model', 'm');
    await fireEvent(screen.getByLabelText('Base URL'), 'blur');
    expect(screen.queryByText(t('providers.url.insecure'))).toBeNull();
  });

  it('asks for a name, an address and a model, and a sensible timeout', async () => {
    await openNewForm('custom');
    await press(t('providers.form.save'));
    expect(await screen.findByText(t('providers.name.required'))).toBeOnTheScreen();
    expect(screen.getByText(t('providers.url.required'))).toBeOnTheScreen();
    expect(screen.getByText(t('providers.model.required'))).toBeOnTheScreen();
    await type('Timeout', '1');
    await fireEvent(screen.getByLabelText('Timeout'), 'blur');
    expect(screen.getByText(t('providers.timeout.invalid'))).toBeOnTheScreen();
    expect(await services.providers.list()).toEqual([]);
  });
});

describe('the key field is write-only (S3)', () => {
  it('masks what is typed, and after saving shows only that a key is set', async () => {
    const onDone = await openNewForm('custom');
    await type('Name', 'Keyed');
    await type('Base URL', 'https://llm.example.test/v1');
    await type('Model', 'm');
    expect(screen.getByLabelText('API key').props.secureTextEntry).toBe(true);
    await type('API key', KEY);
    await press(t('providers.form.save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    // Still mounted (onDone is a mock): the key is nowhere in what is drawn.
    expect(treeText()).not.toContain(KEY);
    expect(screen.getByLabelText('API key').props.value).toBe('');

    const saved = (await services.providers.list())[0]!;
    expect(saved.hasKey).toBe(true);
    await cleanup();

    await openEditForm(saved.id);
    expect(screen.getByLabelText('API key').props.value).toBe('');
    expect(screen.getByText(t('providers.key.saved'))).toBeOnTheScreen();
    expect(treeText()).not.toContain(KEY);
    expect(treeText()).not.toContain('UIKEY');
  });

  it('replaces the key when a new one is typed, and keeps it when the field is left empty', async () => {
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await openEditForm(created.id);
    await type('Name', 'Renamed');
    await press(t('providers.form.save'));
    await waitFor(async () => expect((await services.providers.get(created.id))?.label).toBe('Renamed'));
    expect(await services.secrets.get(created.id)).toBe(KEY);

    await cleanup();
    await openEditForm(created.id);
    await type('API key', 'sk-SECOND-0123456789abcdef');
    await press(t('providers.form.save'));
    await waitFor(async () => expect(await services.secrets.get(created.id)).toBe('sk-SECOND-0123456789abcdef'));
  });

  it('removes a saved key after confirmation', async () => {
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await openEditForm(created.id);
    await press(t('providers.form.removeKey'));
    await fireEvent.press(await screen.findByRole('button', { name: t('providers.key.removeConfirm') }));
    await waitFor(async () => expect(await services.secrets.has(created.id)).toBe(false));
    expect(await screen.findByText(t('providers.key.none'))).toBeOnTheScreen();
  });

  it('clears the key when the base URL is changed, and says so', async () => {
    const created = await services.providers.create({ ...base, apiKey: KEY });
    const onDone = await openEditForm(created.id);
    expect(screen.queryByText(t('providers.key.willClear'))).toBeNull();
    await type('Base URL', 'https://other.example.test/v1');
    expect(await screen.findByText(t('providers.key.willClear'))).toBeOnTheScreen();
    await press(t('providers.form.save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await services.secrets.has(created.id)).toBe(false);
    expect(treeText()).not.toContain(KEY);
  });

  it('reports a key that could not be stored, keeps the typed values, and saves nothing', async () => {
    jest.spyOn(services.secrets, 'set').mockRejectedValue(new Error(`boom ${KEY}`));
    const onDone = await openNewForm('custom');
    await type('Name', 'Keyed');
    await type('Base URL', 'https://llm.example.test/v1');
    await type('Model', 'm');
    await type('API key', KEY);
    await press(t('providers.form.save'));
    expect(await screen.findByText(t('providers.key.storeFailed'))).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name').props.value).toBe('Keyed');
    expect(await services.providers.list()).toEqual([]);
    expect(treeText()).not.toContain('boom');
  });
});

describe('test connection (flow E, step 4)', () => {
  const outcomes: [string, Responder][] = [
    ['ok', OK],
    ['auth_invalid', res(401, openaiError('Incorrect API key provided', 'invalid_request_error', 'invalid_api_key'))],
    ['model_not_found', res(404, openaiError('The model `m` does not exist', 'invalid_request_error', 'model_not_found'))],
    ['no_vision', res(400, openaiError('Image input is not supported by this model', 'invalid_request_error'))],
    ['invalid_output', res(200, openaiText('I cannot produce JSON, sorry'))],
    ['no_network', new Error('Network request failed')],
    ['insecure_url', res(200, openaiText('{}'), {}, { redirected: true })],
    ['quota_exceeded', res(429, openaiError('Rate limit reached', 'rate_limit_exceeded'), { 'retry-after': '30' })],
    ['provider_unavailable', res(503, openaiError('overloaded', 'server_error'))],
    ['content_refused', res(200, { choices: [{ message: { role: 'assistant', content: null, refusal: 'I cannot help with that' }, finish_reason: 'stop' }] })],
  ];

  it.each(outcomes)('says %s in its own words', async (code, responder) => {
    setup(responder);
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await openEditForm(created.id);
    await press(t('providers.form.test'));
    expect(await screen.findByText(t(`providers.test.result.${code}`))).toBeOnTheScreen();
    expect(treeText()).not.toContain(KEY);
  });

  it('gives each outcome a message of its own', () => {
    const messages = [...outcomes.map(([code]) => code), 'timeout', 'unknown'].map((code) => t(`providers.test.result.${code}`));
    expect(new Set(messages).size).toBe(messages.length);
    for (const message of messages) {
      expect(message).not.toMatch(/^providers\./);
      expect(message.length).toBeGreaterThan(15);
    }
    for (const locale of ['es']) {
      const es = [...outcomes.map(([code]) => code), 'timeout', 'unknown'].map((code) => i18n.t(`providers.test.result.${code}`, { lng: locale }));
      expect(new Set(es).size).toBe(es.length);
    }
  });

  it('shows progress while it runs and disables the button, so it cannot be pressed twice', async () => {
    let release!: () => void;
    setup(() => new Promise((resolve) => (release = () => resolve(OK))));
    await openNewForm('custom');
    await type('Base URL', 'https://llm.example.test/v1');
    await type('Model', 'm');
    await press(t('providers.form.test'));
    expect(await screen.findByRole('progressbar', { name: t('providers.form.testing') })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('providers.form.testing') })).toBeDisabled();
    release();
    expect(await screen.findByText(t('providers.test.result.ok'))).toBeOnTheScreen();
  });

  it('asks for a model before testing', async () => {
    await openNewForm('custom');
    await type('Base URL', 'https://llm.example.test/v1');
    await press(t('providers.form.test'));
    expect(await screen.findByText(t('providers.model.required'))).toBeOnTheScreen();
    expect(fake.calls).toHaveLength(0);
  });

  it('keeps the test result with the profile when it is saved afterwards', async () => {
    setup(OK);
    const onDone = await openNewForm('custom');
    await type('Name', 'Tested');
    await type('Base URL', 'https://llm.example.test/v1');
    await type('Model', 'm');
    await press(t('providers.form.test'));
    await screen.findByText(t('providers.test.result.ok'));
    await press(t('providers.form.save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect((await services.providers.list())[0]).toMatchObject({ outputMode: 'schema', lastTestResult: 'ok' });
  });

  it('forgets the shown result when the model changes, because it no longer applies', async () => {
    setup(OK);
    await openNewForm('custom');
    await type('Base URL', 'https://llm.example.test/v1');
    await type('Model', 'm');
    await press(t('providers.form.test'));
    await screen.findByText(t('providers.test.result.ok'));
    await type('Model', 'other');
    expect(screen.queryByText(t('providers.test.result.ok'))).toBeNull();
  });

  it('writes nothing to the console, whatever the outcome', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => jest.spyOn(console, level).mockImplementation(() => undefined));
    setup(res(401, openaiError(`Incorrect API key provided: ${KEY}`, 'invalid_request_error')));
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await openEditForm(created.id);
    await press(t('providers.form.test'));
    await screen.findByText(t('providers.test.result.auth_invalid'));
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(KEY);
  });
});

describe('activating and deleting', () => {
  it('sets a provider active, leaving exactly one', async () => {
    const a = await services.providers.create({ ...base, label: 'A' });
    const b = await services.providers.create({ ...base, label: 'B' });
    await openEditForm(b.id);
    await press(t('providers.form.setActive'));
    await waitFor(async () => expect((await services.providers.get(b.id))?.isActive).toBe(true));
    expect((await services.providers.get(a.id))?.isActive).toBe(false);
    expect(await screen.findByText(t('providers.form.isActive'))).toBeOnTheScreen();
  });

  it('asks before deleting, then removes the profile and its key', async () => {
    const created = await services.providers.create({ ...base, apiKey: KEY });
    const onDone = await openEditForm(created.id);
    await press(t('providers.form.delete'));
    expect(await screen.findByText(t('providers.delete.title'))).toBeOnTheScreen();
    expect(await services.providers.get(created.id)).not.toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: t('providers.delete.confirm') }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await services.providers.get(created.id)).toBeNull();
    expect(await services.secrets.has(created.id)).toBe(false);
  });

  it('does not delete when the person keeps it', async () => {
    const created = await services.providers.create({ ...base, apiKey: KEY });
    await openEditForm(created.id);
    await press(t('providers.form.delete'));
    await fireEvent.press(await screen.findByRole('button', { name: t('providers.delete.keep') }));
    expect(await services.providers.get(created.id)).not.toBeNull();
    expect(await services.secrets.has(created.id)).toBe(true);
  });
});

describe('settings entry', () => {
  it('opens the AI providers section from Settings and shows the active provider', async () => {
    await services.providers.create({ ...base, label: 'Alpha' });
    const onOpen = jest.fn();
    await renderApp(<SettingsScreen onOpen={onOpen} />, { services });
    expect(await screen.findByRole('button', { name: t('settings.providers') })).toBeOnTheScreen();
    expect(await screen.findByText('Alpha (llm.example.test) · m-1')).toBeOnTheScreen();
    await press(t('settings.providers'));
    expect(onOpen).toHaveBeenCalledWith('providers');
  });

  it('says nothing is set up yet when there is no provider', async () => {
    await renderApp(<SettingsScreen onOpen={jest.fn()} />, { services });
    expect(await screen.findByText(t('settings.providersNone'))).toBeOnTheScreen();
  });
});
