import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { useState } from 'react';

import { hangingResponder, openaiText, res, validScanResult } from '@/core/ai/__fixtures__/fixtures';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { FoodSearchScreen } from '../../logging/FoodSearchScreen';
import { ReviewScreen } from '../../logging/ReviewScreen';
import { MealDetailScreen } from '../../meals/MealDetailScreen';
import { SettingsScreen } from '../../settings/SettingsScreen';
import { renderApp } from '../../testing/renderApp';
import { createScanKit, KEY, okReply, type ScanKit } from '../../testing/scanKit';
import { TodayScreen } from '../../today/TodayScreen';
import { ScanFlowScreen } from '../ScanFlowScreen';
import { SLOW_AFTER_MS } from '../constants';

// 21 Nov 2026, 12:00 local: lunch time.
const LUNCH = new Date(2026, 10, 21, 12, 0);
const TODAY = '2026-11-21';

let h: Harness;
let kit: ScanKit;
const clock = () => new Date(LUNCH);

afterEach(async () => {
  await cleanup();
  kit?.services.close();
  h?.close();
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

type View = 'scan' | 'review' | 'search' | 'swap' | 'today' | 'manual' | 'settings' | 'meal';

/** Stands in for the router: the same screens the routes mount, switched by callbacks. */
function Flow({ start = 'scan', slowAfterMs, mealId }: { start?: View; slowAfterMs?: number; mealId?: string }) {
  const [view, setView] = useState<View>(start);
  const [swap, setSwap] = useState<{ key: string; query: string } | null>(null);
  return (
    <>
      {view === 'scan' ? (
        <ScanFlowScreen
          slowAfterMs={slowAfterMs}
          onClose={() => setView('today')}
          onManual={() => setView('manual')}
          onProviderSettings={() => setView('settings')}
          onReview={() => setView('review')}
        />
      ) : null}
      {view === 'review' ? (
        <ReviewScreen
          now={clock}
          onAddItem={() => setView('search')}
          onSwap={(key, query) => {
            setSwap({ key, query });
            setView('swap');
          }}
          onRetake={() => setView('scan')}
          onSaved={() => setView('today')}
          onClose={() => setView('today')}
        />
      ) : null}
      {view === 'search' ? <FoodSearchScreen onAdded={() => setView('review')} onOpenReview={() => setView('review')} onCreateCustom={jest.fn()} /> : null}
      {view === 'swap' && swap ? <FoodSearchScreen swap={swap} onAdded={() => setView('review')} onOpenReview={() => setView('review')} onCreateCustom={jest.fn()} /> : null}
      {view === 'today' ? <TodayScreen now={clock} onOpenSettings={jest.fn()} /> : null}
      {view === 'manual' ? <FoodSearchScreen onAdded={() => setView('review')} onOpenReview={() => setView('review')} onCreateCustom={jest.fn()} /> : null}
      {view === 'settings' ? <SettingsScreen onOpen={jest.fn()} /> : null}
      {view === 'meal' && mealId ? <MealDetailScreen mealId={mealId} now={clock} onClose={() => setView('today')} onCopied={() => setView('today')} /> : null}
    </>
  );
}

async function open(responders?: Parameters<typeof createScanKit>[1], options?: Parameters<typeof createScanKit>[2], ui = <Flow />, locale: 'en' | 'es' = 'en') {
  h = await createHarness();
  kit = await createScanKit(h, responders, options);
  return renderApp(ui, { services: kit.services, scanPlatform: kit.platform, locale });
}

const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

/** Shutter, then Analyze, then the one-time notice (when it is asked). */
async function shootAndAnalyze({ acknowledge = true }: { acknowledge?: boolean } = {}) {
  await press('Take photo');
  await press('Analyze');
  if (acknowledge) await press('Send photo');
}

async function reachReview() {
  await shootAndAnalyze();
  await screen.findByText(/AI found 2 items/);
}

const textOf = () => JSON.stringify(screen.toJSON());

/** The pinned total, as announced: "432 kilocalories, ...". */
const expectTotal = (kcal: number) => expect(screen.getByTestId('review-totals')).toHaveAccessibleName(new RegExp(`^${kcal} kilocalories`));

describe('capture (flow B step 1, S4)', () => {
  it('shows the framing tip the first three times only', async () => {
    await open();
    for (let i = 0; i < 3; i++) {
      expect(await screen.findByText('Whole plate in frame, from above')).toBeOnTheScreen();
      await cleanup();
      await renderApp(<Flow />, { services: kit.services, scanPlatform: kit.platform });
    }
    await screen.findByRole('button', { name: 'Take photo' });
    expect(screen.queryByText('Whole plate in frame, from above')).toBeNull();
  });

  it('offers "Add manually" on the viewfinder itself, so the manual path (search, custom foods, barcodes) never needs the camera to fail first (docs/04 flow D)', async () => {
    await open();
    await screen.findByRole('button', { name: 'Take photo' });
    await press('Add manually');
    expect(await screen.findByLabelText('Search foods')).toBeOnTheScreen();
  });

  it('explains the camera permission before asking for it, then shows the camera once it is granted', async () => {
    await open();
    kit.platform.state.permission = 'undetermined';
    await cleanup();
    await renderApp(<Flow />, { services: kit.services, scanPlatform: kit.platform });
    expect(await screen.findByText(/uses the camera only to photograph your meal/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
    await press('Allow camera');
    expect(await screen.findByRole('button', { name: 'Take photo' })).toBeOnTheScreen();
  });

  it('keeps gallery and manual entry working when the permission is denied', async () => {
    await open();
    kit.platform.state.permission = 'denied';
    await cleanup();
    await renderApp(<Flow />, { services: kit.services, scanPlatform: kit.platform });
    expect(await screen.findByText(/camera is off/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add manually' })).toBeOnTheScreen();
    await press('Choose from gallery');
    expect(await screen.findByRole('button', { name: 'Analyze' })).toBeOnTheScreen();
    expect(screen.getByTestId('scan-photo')).toBeOnTheScreen();
  });

  it('turns the flash on and off', async () => {
    await open();
    const flash = await screen.findByRole('button', { name: 'Flash' });
    expect(flash).not.toBeSelected();
    await fireEvent.press(flash);
    expect(screen.getByRole('button', { name: 'Flash' })).toBeSelected();
    await press('Take photo');
    expect(kit.platform.state.lastFlash).toBe(true);
  });

  it('shows the preview with the photo, a hint field, Retake and Analyze; Retake goes back to the camera and drops the file', async () => {
    await open();
    await press('Take photo');
    expect(await screen.findByTestId('scan-photo')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hint (optional)')).toBeOnTheScreen();
    expect(kit.platform.state.temp.size).toBe(1);
    await press('Retake');
    expect(await screen.findByRole('button', { name: 'Take photo' })).toBeOnTheScreen();
    expect(kit.platform.state.temp.size).toBe(0);
  });

  it('removes the temporary photo when the person closes the scan', async () => {
    await open();
    await press('Take photo');
    await press('Close');
    await waitFor(() => expect(kit.platform.state.temp.size).toBe(0));
  });
});

describe('the one-time notice (S4)', () => {
  it('sends nothing until it is acknowledged; declining returns to the preview', async () => {
    await open();
    await shootAndAnalyze({ acknowledge: false });
    expect(await screen.findByText('This photo will be sent to Test provider')).toBeOnTheScreen();
    expect(kit.fetch.calls).toHaveLength(0);
    await press('Not now');
    expect(await screen.findByRole('button', { name: 'Analyze' })).toBeOnTheScreen();
    expect(kit.fetch.calls).toHaveLength(0);
    expect(await kit.services.scan.noticeAcknowledged(kit.providerId)).toBe(false);
  });

  it('is asked once per profile: not again for the same profile, again for another one', async () => {
    await open();
    await reachReview();
    expect(kit.fetch.calls).toHaveLength(1);
    expect(await kit.services.scan.noticeAcknowledged(kit.providerId)).toBe(true);
    // Second scan with the same profile: straight to analysis.
    await press('Retake');
    await press('Take photo');
    await press('Analyze');
    await waitFor(() => expect(kit.fetch.calls).toHaveLength(2));
    expect(screen.queryByText(/will be sent to/)).toBeNull();

    // Another profile has its own notice.
    const second = await h.repos.aiProviders.create({ label: 'Second', preset: null, adapter: 'openai_compatible', baseUrl: 'https://second.example.test/v1', model: 'm', timeoutS: 30 });
    await kit.services.secrets.set(second.id, 'sk-SECOND-0123456789abcdef');
    await h.repos.aiProviders.setActive(second.id);
    await cleanup();
    await renderApp(<Flow />, { services: kit.services, scanPlatform: kit.platform });
    await shootAndAnalyze({ acknowledge: false });
    expect(await screen.findByText('This photo will be sent to Second')).toBeOnTheScreen();
    expect(kit.fetch.calls).toHaveLength(2);
  });
});

describe('analyzing (flow B step 3)', () => {
  it('keeps the photo visible, shows progress and the provider, and Cancel really aborts the request and stores nothing', async () => {
    await open([hangingResponder]);
    await shootAndAnalyze();
    expect(await screen.findByText('Analyzing your meal')).toBeOnTheScreen();
    expect(screen.getByTestId('scan-photo')).toBeOnTheScreen();
    expect(await screen.findByRole('progressbar')).toBeOnTheScreen();
    expect(screen.getByText('AI provider: Test provider')).toBeOnTheScreen();
    await waitFor(() => expect(kit.fetch.calls).toHaveLength(1));

    await press('Cancel');
    // Back on the preview, photo kept, ready to try again.
    expect(await screen.findByRole('button', { name: 'Analyze' })).toBeOnTheScreen();
    expect(screen.getByTestId('scan-photo')).toBeOnTheScreen();
    await waitFor(async () => expect(await h.repos.scans.list()).toMatchObject([{ status: 'error', errorCode: 'cancelled' }]));
    expect((await h.repos.meals.getDay(TODAY)).meals).toEqual([]);
    expect(kit.fetch.calls).toHaveLength(1);
  });

  it('says the provider is slow after 20 seconds', async () => {
    expect(SLOW_AFTER_MS).toBe(20_000);
    await open([hangingResponder], undefined, <Flow slowAfterMs={80} />);
    await shootAndAnalyze();
    await screen.findByText('Analyzing your meal');
    expect(screen.queryByText(/taking longer than usual/)).toBeNull();
    expect(await screen.findByText(/taking longer than usual/)).toBeOnTheScreen();
  });
});

describe('review of a scan (S5, S6, S7, S11)', () => {
  it('lists the detected items with grams and calories, and saving adds them to the day totals', async () => {
    await open();
    await reachReview();
    expect(screen.getByText('Pollo a la plancha')).toBeOnTheScreen();
    expect(screen.getByLabelText('Grams of Pollo a la plancha').props.value).toBe('120');
    // 120 g × 165 kcal/100 g = 198; 180 g × 130 kcal/100 g = 234; total 432.
    expectTotal(432);
    expect(screen.getByTestId('scan-photo')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Lunch' })).toBeChecked();

    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay(TODAY)).meals).toHaveLength(1));
    const day = await h.repos.meals.getDay(TODAY);
    expect(day.totals.kcal).toBeCloseTo(432, 5);
    expect(day.totals.protein).toBeCloseTo(0.31 * 120 + 0.0269 * 180, 5);
    const [meal] = day.meals;
    const [scanRow] = await h.repos.scans.list();
    expect(meal).toMatchObject({ source: 'scan', scanId: scanRow!.id, slot: 'lunch', name: 'Chicken with rice' });
    expect(meal!.items.map((i) => [i.displayName, i.grams, i.origin, i.foodSource, i.confidenceFood, i.confidencePortion])).toEqual([
      ['Pollo a la plancha', 120, 'ai', 'catalog', 'high', 'medium'],
      ['Arroz blanco', 180, 'ai', 'catalog', 'high', 'medium'],
    ]);
    // Back on Today with the new meal and the totals updated.
    expect((await screen.findAllByText(/432/)).length).toBeGreaterThan(0);
  });

  it('changes grams, removes (with undo) and adds items, and the totals follow with no further provider call', async () => {
    await open();
    await reachReview();
    await type('Grams of Arroz blanco', '200');
    expectTotal(458); // 198 + 260
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Arroz blanco' }));
    expect(screen.getByLabelText('Grams of Arroz blanco').props.value).toBe('210');

    await fireEvent.press(screen.getByRole('button', { name: 'Remove Pollo a la plancha' }));
    expect(screen.queryByText('Pollo a la plancha')).toBeNull();
    expectTotal(273); // 210 g × 1.3
    await fireEvent.press(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Pollo a la plancha')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Pollo a la plancha' }));

    await press('Add another food');
    await fireEvent.changeText(await screen.findByLabelText(/^Search foods$/), 'banana');
    const rows = await screen.findAllByRole('button', { name: /^Bananas, raw/ });
    await fireEvent.press(rows[0]!);
    await fireEvent.changeText(await screen.findByLabelText('Amount in grams'), '100');
    await press('Add to meal');
    await screen.findByText(/AI found/);
    expectTotal(362); // 273 + 89

    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay(TODAY)).meals).toHaveLength(1));
    const [meal] = (await h.repos.meals.getDay(TODAY)).meals;
    expect(meal!.items.map((i) => [i.displayName, i.grams, i.origin])).toEqual([
      ['Arroz blanco', 210, 'ai_edited'],
      ['Bananas, raw', 100, 'manual'],
    ]);
    expect((await h.repos.meals.getDay(TODAY)).totals.kcal).toBeCloseTo(362, 5);
    expect(kit.fetch.calls).toHaveLength(1);
  });

  it('swaps a food through search prefilled with the detected name, keeps the grams, and remembers it for the next scan', async () => {
    await open();
    await reachReview();
    await fireEvent.press(screen.getByRole('button', { name: 'Change food for Arroz blanco' }));
    const field = await screen.findByLabelText(/^Search foods$/);
    expect(field.props.value).toBe('Arroz blanco');
    await fireEvent.changeText(field, 'brown rice');
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Rice, brown, long-grain, cooked/ }))[0]!);

    // The grams stay at 180; calories follow the new food (123 kcal/100 g × 1.8 = 221.4).
    expect(await screen.findByText('Rice, brown, long-grain, cooked')).toBeOnTheScreen();
    expect(screen.getByLabelText('Grams of Rice, brown, long-grain, cooked').props.value).toBe('180');
    expectTotal(419); // 198 + 221.4
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
    expect(kit.fetch.calls).toHaveLength(1);

    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay(TODAY)).meals).toHaveLength(1));
    const [meal] = (await h.repos.meals.getDay(TODAY)).meals;
    expect(meal!.items[1]).toMatchObject({ foodSource: 'catalog', origin: 'ai_edited', grams: 180 });
    expect(await h.repos.matchMemory.getEntry('arroz blanco')).not.toBeNull();

    // The next scan of the same detected name applies it first.
    await cleanup();
    await renderApp(<Flow />, { services: kit.services, scanPlatform: kit.platform });
    await shootAndAnalyze({ acknowledge: false });
    await screen.findByText(/AI found 2 items/);
    expect(screen.getByText(/Matched to Rice, brown, long-grain, cooked/)).toBeOnTheScreen();
    expectTotal(419);
  });

  it('shows the three item states, and both low-confidence marks, in text', async () => {
    const lowBoth = { ...validScanResult.items[1]!, confidence_food: 'low', confidence_portion: 'low' };
    const lowPortion = { ...validScanResult.items[0]!, confidence_portion: 'low' };
    const estimate = { ...validScanResult.items[0]!, name: 'Zorblax stew', canonical_name_en: 'zorblax stew', search_terms_en: ['zorblax'], grams: 100 };
    await open([okReply({ ...validScanResult, items: [lowPortion, lowBoth, estimate] })]);
    await shootAndAnalyze();
    await screen.findByText(/AI found 3 items/);

    const row = (name: string) => screen.getByTestId(`review-item-${name}`);
    expect(within(row('Pollo a la plancha')).getByText('Catalog')).toBeOnTheScreen();
    expect(within(row('Pollo a la plancha')).getByText('Check portion')).toBeOnTheScreen();
    expect(within(row('Pollo a la plancha')).queryByText('Check food')).toBeNull();
    expect(within(row('Arroz blanco')).getByText('Check food')).toBeOnTheScreen();
    expect(within(row('Arroz blanco')).getByText('Check portion')).toBeOnTheScreen();
    expect(within(row('Zorblax stew')).getByText('AI estimate')).toBeOnTheScreen();

    // Editing a catalog item makes it "Confirmed"; an AI estimate keeps its mark even when edited.
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Arroz blanco' }));
    expect(within(row('Arroz blanco')).getByText('Confirmed')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Zorblax stew' }));
    expect(within(row('Zorblax stew')).getByText('AI estimate')).toBeOnTheScreen();
  });

  it('flags implausible weights from core', async () => {
    const heavy = { ...validScanResult.items[0]!, grams: 1500 };
    const rice = { ...validScanResult.items[1]!, grams: 1200 };
    await open([okReply({ ...validScanResult, items: [heavy, rice] })]);
    await shootAndAnalyze();
    await screen.findByText(/AI found 2 items/);
    expect(within(screen.getByTestId('review-item-Pollo a la plancha')).getByText(/very large amount/i)).toBeOnTheScreen();
    expect(screen.getByText(/total weight is very high/i)).toBeOnTheScreen();
  });

  it('keeps an item with an implausible fallback free of numbers and unsaveable until it is matched or removed', async () => {
    const bogus = { ...validScanResult.items[0]!, name: 'Zorblax stew', canonical_name_en: 'zorblax stew', search_terms_en: ['zorblax'], grams: 150, fallback_per_100g: { kcal: 20, protein_g: 80, carbs_g: 60, fat_g: 30 } };
    await open([okReply({ ...validScanResult, items: [validScanResult.items[1], bogus] })]);
    await shootAndAnalyze();
    await screen.findByText(/AI found 2 items/);
    const row = screen.getByTestId('review-item-Zorblax stew');
    expect(within(row).getByText('Needs a match')).toBeOnTheScreen();
    expect(within(row).queryByText(/kcal/)).toBeNull();
    expect(screen.getByText(/Pick a food for each item that needs a match/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
    // Totals count only what has numbers.
    expectTotal(234);

    // Removing it unblocks Save.
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Zorblax stew' }));
    expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled();
  });

  it('lets a needs-a-match item be matched by search, which keeps its grams', async () => {
    const bogus = { ...validScanResult.items[0]!, name: 'Zorblax stew', canonical_name_en: 'zorblax stew', search_terms_en: ['zorblax'], grams: 150, fallback_per_100g: { kcal: 20, protein_g: 80, carbs_g: 60, fat_g: 30 } };
    await open([okReply({ ...validScanResult, items: [bogus] })]);
    await shootAndAnalyze();
    await screen.findByText(/AI found 1 item/);
    await fireEvent.press(screen.getByRole('button', { name: 'Change food for Zorblax stew' }));
    const field = await screen.findByLabelText(/^Search foods$/);
    await fireEvent.changeText(field, 'lentils');
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Lentils, raw/ }))[0]!);
    expect(await screen.findByText('Confirmed')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled();
    expectTotal(528); // 352 × 1.5
  });

  it('asks before leaving a review with unsaved items, and removes the photo when discarding', async () => {
    await open();
    await reachReview();
    expect(kit.platform.state.temp.size).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Discard this meal?')).toBeOnTheScreen();
    await press('Keep editing');
    expect(screen.getByText('Pollo a la plancha')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await press('Discard meal');
    await waitFor(() => expect(kit.platform.state.temp.size).toBe(0));
    expect((await h.repos.meals.getDay(TODAY)).meals).toEqual([]);
  });

  it('Retake drops the photo and the items and returns to the camera', async () => {
    await open();
    await reachReview();
    await press('Retake');
    expect(await screen.findByRole('button', { name: 'Take photo' })).toBeOnTheScreen();
    expect(kit.platform.state.temp.size).toBe(0);
  });
});

describe('failures (S8, flow C)', () => {
  const cases: [string, Parameters<typeof createScanKit>[1], Parameters<typeof createScanKit>[2], RegExp, string | null][] = [
    ['no provider', undefined, { provider: false }, /Photo analysis needs an AI provider/, 'Set up provider'],
    ['no network', [new Error('Network request failed')], undefined, /No connection/, 'Try again'],
    ['an invalid key', [res(401, { error: { message: 'bad key' } })], undefined, /Your key was rejected/, 'Open provider settings'],
    ['a limit reached', [res(429, { error: { message: 'slow' } }, { 'Retry-After': '7800' })], undefined, /Provider limit reached/, 'Switch provider'],
    ['a model that cannot read images', [res(400, { error: { message: 'This model does not support image input' } })], undefined, /can.t read photos/, 'Open provider settings'],
    ['an unusable answer', [res(200, openaiText('nope')), res(200, openaiText('still nope'))], undefined, /answer could not be read/, 'Try again'],
    ['no food', [okReply({ is_food: false, dish_name: '', items: [], hidden_ingredients_note: '' })], undefined, /No food found/, 'Retake'],
    ['an insecure URL', undefined, { baseUrl: 'http://api.example.test/v1' }, /not secure/, 'Open provider settings'],
  ];

  it.each(cases)('%s: its own message, the photo kept, and manual entry offered', async (_name, responders, options, title, action) => {
    await open(responders, options);
    // Without a profile there is nothing to be told about, so no notice comes first.
    await shootAndAnalyze({ acknowledge: options?.provider !== false });
    expect(await screen.findByText(title)).toBeOnTheScreen();
    expect(screen.getByTestId('failure-photo')).toBeOnTheScreen();
    expect(screen.getByText('Your photo is still here')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add manually' })).toBeOnTheScreen();
    if (action) expect(screen.getByRole('button', { name: action })).toBeOnTheScreen();
    expect((await h.repos.meals.getDay(TODAY)).meals).toEqual([]);
  });

  it('says how long to wait when the provider reports it', async () => {
    await open([res(429, { error: { message: 'slow' } }, { 'Retry-After': '7800' })]);
    await shootAndAnalyze();
    expect(await screen.findByText(/about 2 h 10 min/)).toBeOnTheScreen();
  });

  it('retries from the failure screen without taking the photo again', async () => {
    await open([new Error('Network request failed'), new Error('Network request failed'), okReply()]);
    await shootAndAnalyze();
    await press('Try again');
    await screen.findByText(/AI found 2 items/);
    expect(kit.platform.state.prepareCalls).toBe(1);
  });

  it('opens manual entry and removes the temporary photo', async () => {
    await open([new Error('Network request failed')]);
    await shootAndAnalyze();
    await press('Add manually');
    expect(await screen.findByLabelText(/^Search foods$/)).toBeOnTheScreen();
    await waitFor(() => expect(kit.platform.state.temp.size).toBe(0));
  });

  it('never shows the key: not on screen, not in the copyable detail, not in the scan row', async () => {
    await open([new Error(`socket exploded for ${KEY} and Bearer ${KEY}`)]);
    await shootAndAnalyze();
    await screen.findByTestId('failure-photo');
    expect(textOf()).not.toContain(KEY);
    const copy = screen.queryByRole('button', { name: 'Copy detail' });
    if (copy) {
      await fireEvent.press(copy);
      await waitFor(() => expect(kit.platform.state.copied.length).toBe(1));
      expect(kit.platform.state.copied[0]).not.toContain(KEY);
    }
    expect(JSON.stringify(await h.repos.scans.list())).not.toContain(KEY);
  });

  it('shows an unknown error with a redacted detail that can be copied', async () => {
    await open();
    jest.spyOn(kit.services.catalog, 'match').mockRejectedValue(new Error('index corrupted near sk-ABCDEFGHIJKLMNOP'));
    await shootAndAnalyze();
    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    const detail = screen.getByTestId('error-detail');
    expect(detail.props.selectable).toBe(true);
    expect(JSON.stringify(detail.props.children)).toContain('index corrupted');
    expect(JSON.stringify(detail.props.children)).not.toContain('sk-ABCDEFGHIJKLMNOP');
    await fireEvent.press(screen.getByRole('button', { name: 'Copy detail' }));
    await waitFor(() => expect(kit.platform.state.copied).toHaveLength(1));
    expect(kit.platform.state.copied[0]).not.toContain('sk-ABCDEFGHIJKLMNOP');
  });
});

describe('photo retention (S9)', () => {
  it('keeps a compressed copy by default, stores its path on the meal, and removes the temporary files', async () => {
    await open();
    await reachReview();
    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay(TODAY)).meals).toHaveLength(1));
    const [meal] = (await h.repos.meals.getDay(TODAY)).meals;
    expect(meal!.photoPath).toMatch(/^photos\/.+\.jpg$/);
    expect(kit.platform.state.kept.has(meal!.photoPath!)).toBe(true);
    expect(kit.platform.state.temp.size).toBe(0);
  });

  it('keeps nothing when the setting is off', async () => {
    await open();
    await h.repos.settings.set('keep_photos', 'false');
    await reachReview();
    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay(TODAY)).meals).toHaveLength(1));
    const [meal] = (await h.repos.meals.getDay(TODAY)).meals;
    expect(meal!.photoPath).toBeNull();
    expect(kit.platform.state.kept.size).toBe(0);
    expect(kit.platform.state.temp.size).toBe(0);
  });

  it('has a setting to choose, default on', async () => {
    await open(undefined, undefined, <Flow start="settings" />);
    expect(await screen.findByText('Keep meal photos')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Keep' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: "Don't keep" }));
    await waitFor(async () => expect(await h.repos.settings.get('keep_photos')).toBe('false'));
    expect(screen.getByRole('radio', { name: "Don't keep" })).toBeChecked();
  });

  it('does not lose the meal when the photo cannot be kept', async () => {
    await open();
    kit.platform.state.failKeep = true;
    await reachReview();
    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay(TODAY)).meals).toHaveLength(1));
    expect((await h.repos.meals.getDay(TODAY)).meals[0]!.photoPath).toBeNull();
    expect(kit.platform.state.temp.size).toBe(0);
  });

  it('shows the photo on the meal detail and deletes it with the meal', async () => {
    await open();
    await reachReview();
    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay(TODAY)).meals).toHaveLength(1));
    const [meal] = (await h.repos.meals.getDay(TODAY)).meals;
    await cleanup();
    await renderApp(<Flow start="meal" mealId={meal!.id} />, { services: kit.services, scanPlatform: kit.platform });
    expect(await screen.findByTestId('meal-photo')).toBeOnTheScreen();
    await press('Delete meal');
    const confirm = await screen.findAllByRole('button', { name: 'Delete meal' });
    await fireEvent.press(confirm[confirm.length - 1]!);
    await waitFor(async () => expect(await h.repos.meals.getMeal(meal!.id)).toBeNull());
    await waitFor(() => expect(kit.platform.state.kept.size).toBe(0));
  });
});

describe('Spanish', () => {
  it('shows the scan flow in Spanish and tells the model the app language', async () => {
    await open(undefined, undefined, <Flow />, 'es');
    expect(await screen.findByText('El plato completo en el encuadre, desde arriba')).toBeOnTheScreen();
    await press('Tomar foto');
    await press('Analizar');
    expect(await screen.findByText('Esta foto se enviará a Test provider')).toBeOnTheScreen();
    await press('Enviar foto');
    await screen.findByText(/La IA encontró 2 alimentos/);
    expect(kit.fetch.calls[0]!.rawBody).toContain('Spanish (es)');
    expect(screen.getAllByText('Catálogo')).toHaveLength(2);
  });
});

