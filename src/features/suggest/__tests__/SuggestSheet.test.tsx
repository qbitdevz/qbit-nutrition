import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import type { FoodSuggestion } from '@/core/ai';
import { fakeFetch, hangingResponder, openaiRefusal, openaiText, res } from '@/core/ai/__fixtures__/fixtures';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { FoodSearchScreen } from '../../logging/FoodSearchScreen';
import { MealDraftProvider } from '../../logging/draft';
import { ReviewScreen } from '../../logging/ReviewScreen';
import { dumpAll } from '../../testing/backupDump';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { TodayScreen } from '../../today/TodayScreen';

// 21 Nov 2026, 17:00 local.
const NOW = new Date(2026, 10, 21, 17, 0);
const clock = () => new Date(NOW);
const KEY = 'sk-SUGGEST-UI-0123456789abcdef';

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let fetched: ReturnType<typeof fakeFetch>;
let providerId = '';

afterEach(async () => {
  await cleanup();
  services?.close();
  h?.close();
  services = undefined as never;
  h = undefined as never;
  await i18n.changeLanguage('en');
});

const good = (over: object = {}) => ({ name: 'Greek yogurt', grams: 170, kcal: 100, protein_g: 17, carbs_g: 6, fat_g: 0.7, reason: 'Adds the protein you still have left.', ...over });
const reply = (...items: object[]) => res(200, openaiText(JSON.stringify({ suggestions: items.length > 0 ? items : [good()] })));

interface Options {
  responders?: Parameters<typeof fakeFetch>;
  provider?: boolean;
  goal?: boolean;
  /** Calories left today. */
  left?: number;
  acknowledged?: boolean;
  locale?: 'en' | 'es';
}

const handlers = { onProviderSettings: jest.fn(), onSetupTargets: jest.fn(), onAddSuggestion: jest.fn() };

async function seed({ responders = [reply()], provider = true, goal = true, left = 520, acknowledged = false }: Options = {}) {
  h = await createHarness();
  fetched = fakeFetch(...responders);
  services = createTestServices(h, { fetch: fetched.fetch });
  for (const handler of Object.values(handlers)) handler.mockClear();
  if (goal) {
    await h.repos.goals.set({ type: 'lose_fat', pace: 'gentle', startDate: '2026-01-01', kcalTarget: 2000, proteinGTarget: 120, carbsGTarget: 220, fatGTarget: 60, isCustom: false });
    const eaten = 2000 - left;
    await h.repos.meals.save({
      eatenAt: new Date(2026, 10, 21, 12, 0),
      slot: 'lunch',
      source: 'manual',
      items: [{ displayName: 'Lunch', grams: 400, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: eaten, protein: 82, carbs: 160, fat: 46 } }],
    });
  }
  if (provider) {
    const created = await h.repos.aiProviders.create({ label: 'Test provider', preset: null, adapter: 'openai_compatible', baseUrl: 'https://llm.example.test/v1', model: 'test-model', timeoutS: 30 });
    await services.secrets.set(created.id, KEY);
    providerId = created.id;
    if (acknowledged) await services.scan.acknowledgeSuggestNotice(created.id);
  }
}

async function openToday(options: Options = {}) {
  await seed(options);
  return renderApp(<TodayScreen now={clock} onOpenSettings={jest.fn()} {...handlers} />, { services, locale: options.locale ?? 'en' });
}

const press = async (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const askButton = () => screen.findByRole('button', { name: 'Suggest foods' });

describe('the action on Today (S6)', () => {
  it('is an AI-marked button that asks on demand: nothing is sent when Today opens', async () => {
    await openToday();
    await askButton();
    expect(screen.getByTestId('suggest-entry')).toBeOnTheScreen();
    expect(screen.getByText(/Only your remaining calories and macros are sent/)).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetched.calls).toHaveLength(0); // never automatically
  });

  it('is not offered for a past day', async () => {
    await openToday();
    await askButton();
    await fireEvent.press(screen.getByTestId('previous-day'));
    await waitFor(() => expect(screen.getByTestId('day-title')).toHaveTextContent(/Yesterday/));
    expect(screen.queryByTestId('suggest-entry')).toBeNull();
  });
});

describe('the first use explains what is sent, once (S9)', () => {
  it('shows the notice with the provider and the numbers, sends nothing until "Get suggestions", then never again', async () => {
    await openToday();
    await press('Suggest foods');
    expect(await screen.findByText('Send what is left today to Test provider (llm.example.test)?')).toBeOnTheScreen();
    expect(screen.getByText(/To suggest foods, these numbers are sent to Test provider \(llm\.example\.test\)/)).toBeOnTheScreen();
    expect(screen.getByText(/No photos, no meals, no profile and no history are sent/)).toBeOnTheScreen();
    expect(screen.getByTestId('suggest-sends')).toHaveTextContent('Sent: 520 kcal, 38 g protein, 60 g carbs and 14 g fat left. Goal: Lose fat. Language: English.');
    expect(fetched.calls).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('suggest-notice-decline'));
    await waitFor(() => expect(screen.queryByText('Send what is left today to Test provider (llm.example.test)?')).toBeNull());
    expect(fetched.calls).toHaveLength(0);
    expect(await services.scan.suggestNoticeAcknowledged(providerId)).toBe(false);

    await press('Suggest foods');
    await fireEvent.press(await screen.findByTestId('suggest-notice-continue'));
    expect(await screen.findByText('Greek yogurt')).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(1);
    expect(await services.scan.suggestNoticeAcknowledged(providerId)).toBe(true);

    // Close and ask again: no notice, one more request.
    await press('Close');
    await waitFor(() => expect(screen.queryByText('Greek yogurt')).toBeNull());
    await press('Suggest foods');
    expect(await screen.findByText('Greek yogurt')).toBeOnTheScreen();
    expect(screen.queryByText('Send what is left today to Test provider (llm.example.test)?')).toBeNull();
    expect(fetched.calls).toHaveLength(2);
  });

  it('is in Spanish too', async () => {
    await openToday({ locale: 'es' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Sugerir alimentos' }));
    expect(await screen.findByText('¿Enviar a Test provider (llm.example.test) lo que te queda hoy?')).toBeOnTheScreen();
    expect(screen.getByTestId('suggest-sends')).toHaveTextContent('Se envía: te quedan 520 kcal, 38 g de proteínas, 60 g de carbohidratos y 14 g de grasa. Objetivo: Perder grasa. Idioma: Español.');
    expect(fetched.calls).toHaveLength(0);
  });
});

describe('asking and the result', () => {
  it('sends one request with the remaining numbers only, then lists the ideas as estimates with a way to add each', async () => {
    await openToday({ acknowledged: true, responders: [reply(good(), good({ name: 'Apple', grams: 180, kcal: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3, reason: 'Fruit with fiber.' }))] });
    await press('Suggest foods');
    expect(await screen.findByText('Greek yogurt')).toBeOnTheScreen();
    expect(screen.getByText('Apple')).toBeOnTheScreen();
    expect(screen.getByText('Adds the protein you still have left.')).toBeOnTheScreen();
    expect(screen.getAllByText('AI estimate')).toHaveLength(2);
    expect(screen.getAllByText('About 170 g · ≈ 100 kcal · P 17 · C 6 · F 0.7')).toHaveLength(1);
    expect(screen.getByText(/Amounts and values are AI estimates/)).toBeOnTheScreen();

    expect(fetched.calls).toHaveLength(1);
    expect(fetched.calls[0]!.rawBody).toContain('{\\"remaining\\":{\\"kcal\\":520,\\"protein_g\\":38,\\"carbs_g\\":60,\\"fat_g\\":14},\\"goal\\":\\"lose_fat\\",\\"locale\\":\\"en\\"}');

    await fireEvent.press(screen.getByRole('button', { name: 'Add Apple to a meal' }));
    expect(handlers.onAddSuggestion).toHaveBeenCalledTimes(1);
    expect(handlers.onAddSuggestion.mock.calls[0]![0]).toMatchObject({ name: 'Apple', grams: 180 });
  });

  it('shows loading with Cancel; cancelling closes the sheet and a late answer is ignored', async () => {
    await openToday({ acknowledged: true, responders: [hangingResponder] });
    await press('Suggest foods');
    expect(await screen.findByTestId('suggest-loading')).toBeOnTheScreen();
    expect(screen.getByText('Looking for foods that fit')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('suggest-cancel'));
    await waitFor(() => expect(screen.queryByTestId('suggest-loading')).toBeNull());
    expect(screen.queryByText('Greek yogurt')).toBeNull();
  });

  it('says so, without a request failure, when no idea fits what is left', async () => {
    await openToday({ acknowledged: true, responders: [reply(good({ kcal: 900, protein_g: 40, carbs_g: 90, fat_g: 40 }))] });
    await press('Suggest foods');
    expect(await screen.findByText('No suggestions this time')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('renders model text as plain text: markup is cleaned, nothing is interpreted', async () => {
    await openToday({ acknowledged: true, responders: [reply(good({ name: '**Greek** <b>yogurt</b>', reason: '[click](http://x.test) for protein' }))] });
    await press('Suggest foods');
    expect(await screen.findByText('Greek yogurt')).toBeOnTheScreen();
    expect(screen.getByText('click for protein')).toBeOnTheScreen();
  });

  it('records nothing about the suggestions: the only change in the database is the notice acknowledgement', async () => {
    await openToday({ acknowledged: false });
    const before = dumpAll(h);
    await press('Suggest foods');
    await fireEvent.press(await screen.findByTestId('suggest-notice-continue'));
    await screen.findByText('Greek yogurt');
    const after = dumpAll(h);
    const changed = Object.keys(after).filter((table) => JSON.stringify(after[table]) !== JSON.stringify(before[table]));
    expect(changed).toEqual(['setting']);
    expect((after.setting as { key: string }[]).map((row) => row.key).filter((key) => !(before.setting as { key: string }[]).some((b) => b.key === key))).toEqual([`notice_ack.suggest.${providerId}`]);
  });
});

describe('when the provider is not called', () => {
  it('leads to the provider settings when none is set up, and sends nothing', async () => {
    await openToday({ provider: false });
    await press('Suggest foods');
    expect(await screen.findByText('No AI provider set up')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('suggest-setup-provider'));
    expect(handlers.onProviderSettings).toHaveBeenCalledTimes(1);
    expect(fetched.calls).toHaveLength(0);
  });

  it('asks for targets first when there is no goal', async () => {
    await openToday({ goal: false });
    await press('Suggest foods');
    expect(await screen.findByText('Set your targets first')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('suggest-setup-targets'));
    expect(handlers.onSetupTargets).toHaveBeenCalledTimes(1);
    expect(fetched.calls).toHaveLength(0);
  });

  it('says neutrally that nothing is left, and does not call the provider (or show the notice)', async () => {
    await openToday({ left: 40 });
    await press('Suggest foods');
    expect(await screen.findByText('Nothing left to suggest today')).toBeOnTheScreen();
    expect(screen.getByText('You have reached today’s calories, so there is nothing to add. Suggestions are not requested.')).toBeOnTheScreen();
    expect(screen.queryByText(/Send what is left today/)).toBeNull();
    expect(fetched.calls).toHaveLength(0);
  });
});

describe('every failure of the provider taxonomy has its message', () => {
  const cases: [string, Parameters<typeof fakeFetch>[0][], string, string, string | undefined][] = [
    ['no network', [new Error('Network request failed')], 'No connection', 'The suggestions could not be requested without internet. Try again when you are online.', undefined],
    ['an invalid key', [res(401, { error: { message: 'Incorrect API key provided.' } })], 'The AI provider refused the key', 'Check the key in the provider settings, then try again.', 'AI provider settings'],
    ['an unknown model', [res(404, { error: { message: 'The model does not exist' } })], 'Model not available', 'The provider does not know the model you chose. Pick another in the provider settings.', 'AI provider settings'],
    ['the limit', [res(429, { error: { message: 'Rate limit reached' } }, { 'retry-after': '7800' })], 'Provider limit reached', 'Your AI provider has no requests left for now. The limit resets in about 2 h 10 min.', undefined],
    ['the limit without a time', [res(429, { error: { message: 'Rate limit reached' } })], 'Provider limit reached', 'Your AI provider has no requests left for now.', undefined],
    ['an unavailable provider', [res(503, { error: { message: 'down' } })], 'The provider is not available', 'The AI provider had a problem. Try again in a few minutes.', undefined],
    ['an unreadable answer', [res(200, openaiText('not json at all')), res(200, openaiText('still not json'))], 'The answer could not be read', 'The model did not answer in the expected format. Try again, or pick another model in the provider settings.', 'AI provider settings'],
    ['a refusal', [res(200, openaiRefusal)], 'The model declined', 'The AI provider declined to answer this request. Try again later.', undefined],
    ['something unexpected', [res(418, { error: { message: 'teapot' } })], 'Something went wrong', 'The suggestions could not be requested. Try again. The detail below can help if it keeps happening.', undefined],
  ];

  it.each(cases)('%s', async (_name, responders, title, message, settingsAction) => {
    await openToday({ acknowledged: true, responders });
    await press('Suggest foods');
    expect(await screen.findByText(title)).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    if (settingsAction) {
      await press(settingsAction);
      expect(handlers.onProviderSettings).toHaveBeenCalledTimes(1);
    }
  });

  it('shows the redacted technical detail only for an unknown error, never the key', async () => {
    await openToday({ acknowledged: true, responders: [res(418, { error: { message: `teapot ${KEY}` } })] });
    await press('Suggest foods');
    const detail = await screen.findByTestId('error-detail');
    expect(detail).toHaveTextContent(/teapot/);
    expect(JSON.stringify(screen.toJSON())).not.toContain(KEY);
  });

  it('"Try again" asks once more, and a later success shows the ideas', async () => {
    await openToday({ acknowledged: true, responders: [res(401, { error: { message: 'Incorrect API key provided.' } }), reply()] });
    await press('Suggest foods');
    await screen.findByText('The AI provider refused the key');
    await press('Try again');
    expect(await screen.findByText('Greek yogurt')).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(2);
  });

  it('every failure has its texts in English and Spanish', () => {
    const kinds = ['no_network', 'timeout', 'auth_invalid', 'model_not_found', 'no_vision', 'quota', 'provider_unavailable', 'invalid_output', 'no_food', 'provider_changed', 'insecure_url', 'unknown'];
    for (const kind of kinds) {
      for (const lng of ['en', 'es']) {
        for (const part of ['title', 'message']) {
          const key = `suggest.failure.${kind}.${part}`;
          expect(i18n.getFixedT(lng)(key)).not.toBe(key);
        }
      }
    }
  });
});

describe('adding a suggestion goes through the search and the portion sheet: the saved values are the catalog\'s, not the model\'s', () => {
  type View = 'today' | 'search' | 'review';
  function Flow() {
    const [view, setView] = useState<View>('today');
    const [prefill, setPrefill] = useState<{ query: string; grams?: number } | undefined>();
    const add = (suggestion: FoodSuggestion) => {
      setPrefill({ query: suggestion.name, grams: suggestion.grams });
      setView('search');
    };
    return (
      <MealDraftProvider>
        {view === 'today' ? <TodayScreen now={clock} onOpenSettings={jest.fn()} onProviderSettings={jest.fn()} onAddSuggestion={add} /> : null}
        {view === 'search' ? <FoodSearchScreen prefill={prefill} onAdded={() => setView('review')} onOpenReview={() => setView('review')} onCreateCustom={jest.fn()} /> : null}
        {view === 'review' ? <ReviewScreen now={clock} onAddItem={() => setView('search')} onSaved={() => setView('today')} onClose={() => setView('search')} /> : null}
      </MealDraftProvider>
    );
  }

  it('prefills the name and the grams, computes the values from the catalog, and saves those', async () => {
    // The model says 150 g of chicken is 100 kcal; the catalog says 165 kcal per 100 g, so 247.5 kcal.
    await seed({ acknowledged: true, responders: [reply(good({ name: 'chicken breast', grams: 150, kcal: 100, protein_g: 17, carbs_g: 6, fat_g: 0.7, reason: 'Lean protein.' }))] });
    await renderApp(<Flow />, { services });
    await press('Suggest foods');
    await screen.findByText('chicken breast');
    await fireEvent.press(screen.getByRole('button', { name: 'Add chicken breast to a meal' }));

    // The search opens with the suggested name typed in; pick the catalog food.
    const field = await screen.findByLabelText('Search foods');
    expect(field.props.value).toBe('chicken breast');
    const rows = await screen.findAllByRole('button', { name: /Chicken, breast, meat only, cooked, grilled/ });
    await fireEvent.press(rows.find((row) => !/favorites$/.test(String(row.props.accessibilityLabel)))!);
    // The sheet starts from the suggested grams, not from the catalog's household measure or 100 g.
    const amount = await screen.findByLabelText('Amount in grams');
    expect(amount.props.value).toBe('150');
    expect(screen.getByText(/248 kcal/)).toBeOnTheScreen(); // 165 x 1.5, from the catalog; the model's 100 is nowhere
    expect(screen.queryByText(/^100 kcal/)).toBeNull();
    await press('Add to meal');

    await screen.findByText('Review your meal');
    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay('2026-11-21')).meals).toHaveLength(2));
    const items = (await h.repos.meals.getDay('2026-11-21')).meals.flatMap((m) => m.items).filter((i) => i.foodSource !== 'ai_estimate');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ foodSource: 'catalog', grams: 150, origin: 'manual' });
    expect(items[0]!.kcal).toBeCloseTo(247.5, 1);
    expect(items[0]!.kcal).not.toBeCloseTo(100, 0);
  });
});
