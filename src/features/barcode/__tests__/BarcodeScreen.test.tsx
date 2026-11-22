import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { fakeFetch, hangingResponder, res } from '@/core/ai/__fixtures__/fixtures';
import { NUTELLA_CODE, foundProduct, notFoundResponse, nutellaResponse } from '@/core/barcode/__fixtures__/off';
import { createHarness, type Harness } from '@/data/testing/harness';
import i18n from '@/i18n';
import { createFakeScanPlatform, type FakeScanPlatform } from '@/platform/fakeScanPlatform';
import { FoodSearchScreen } from '../../logging/FoodSearchScreen';
import { MealDraftProvider } from '../../logging/draft';
import { ReviewScreen } from '../../logging/ReviewScreen';
import { renderApp } from '../../testing/renderApp';
import { createTestServices } from '../../testing/testServices';
import { TodayScreen } from '../../today/TodayScreen';
import { BarcodeScreen } from '../BarcodeScreen';

const LUNCH = new Date(2026, 10, 21, 12, 0);
const clock = () => new Date(LUNCH);

let h: Harness;
let services: ReturnType<typeof createTestServices>;
let platform: FakeScanPlatform;
let fetched: ReturnType<typeof fakeFetch>;

afterEach(async () => {
  await cleanup();
  services?.close();
  h?.close();
  services = undefined as never;
  h = undefined as never;
  await i18n.changeLanguage('en');
});

type View = 'search' | 'barcode' | 'review' | 'today' | 'custom';
const onCreateCustom = jest.fn();

/** Stands in for the router: the same screens the routes mount, switched by callbacks. */
function Flow({ start = 'barcode' }: { start?: View }) {
  const [view, setView] = useState<View>(start);
  return (
    <MealDraftProvider>
      {view === 'search' ? <FoodSearchScreen onAdded={() => setView('review')} onOpenReview={() => setView('review')} onCreateCustom={jest.fn()} onBarcode={() => setView('barcode')} /> : null}
      {view === 'barcode' ? <BarcodeScreen onAdded={() => setView('review')} onCreateCustom={onCreateCustom} onBack={() => setView('search')} /> : null}
      {view === 'review' ? <ReviewScreen now={clock} onAddItem={() => setView('search')} onSaved={() => setView('today')} onClose={() => setView('search')} /> : null}
      {view === 'today' ? <TodayScreen now={clock} onOpenSettings={jest.fn()} /> : null}
    </MealDraftProvider>
  );
}

async function setup(options: { responders?: Parameters<typeof fakeFetch>; permission?: 'granted' | 'denied' | 'undetermined'; acknowledged?: boolean; locale?: 'en' | 'es'; start?: View } = {}) {
  h = await createHarness();
  fetched = fakeFetch(...(options.responders ?? [nutellaResponse()]));
  services = createTestServices(h, { barcodeFetch: fetched.fetch });
  platform = createFakeScanPlatform({ permission: options.permission ?? 'granted' });
  if (options.acknowledged !== false) await services.barcode.acknowledgeNotice();
  onCreateCustom.mockClear();
  return renderApp(<Flow start={options.start} />, { services, locale: options.locale ?? 'en', scanPlatform: platform });
}

const input = () => screen.findByLabelText('Barcode number');
const typeCode = async (code: string) => fireEvent.changeText(await input(), code);
const pressLookup = () => fireEvent.press(screen.getByTestId('barcode-lookup'));
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

describe('entry: camera or typed number', () => {
  it('shows the camera preview and the number field; typing alone sends nothing', async () => {
    await setup();
    expect(await screen.findByTestId('fake-barcode-camera')).toBeOnTheScreen();
    expect(platform.state.barcodeCameraOn).toBe(true);
    for (const partial of ['3', '30', '301', '30176240', '3017624010701']) await typeCode(partial);
    expect(fetched.calls).toHaveLength(0);
    expect(screen.getByLabelText('Barcode number')).toBeOnTheScreen();
  });

  it('looks up exactly once when the person presses "Look up product" (and the one-time notice was already seen)', async () => {
    await setup();
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByTestId('barcode-product-name')).toHaveTextContent('Nutella');
    expect(fetched.calls).toHaveLength(1);
    expect(fetched.calls[0]!.url).toContain(`/product/${NUTELLA_CODE}?fields=`);
    expect(platform.state.barcodeCameraOn).toBe(false); // the camera is off once a product is shown
  });

  it('reads a barcode from the camera and looks it up once, however many times the camera reports it', async () => {
    await setup();
    await screen.findByTestId('fake-barcode-camera');
    await act(async () => {
      platform.emitBarcode(NUTELLA_CODE, 'ean13');
      platform.emitBarcode(NUTELLA_CODE, 'ean13');
      platform.emitBarcode(NUTELLA_CODE, 'ean13');
    });
    expect(await screen.findByTestId('barcode-product-name')).toHaveTextContent('Nutella');
    expect(fetched.calls).toHaveLength(1);
  });

  it('reads a UPC-A and looks it up as the EAN-13 with a leading zero', async () => {
    await setup({ responders: [foundProduct({ product_name: 'Cola', nutriments: { 'energy-kcal_100g': 42, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 } }, '0036000291452')] });
    await screen.findByTestId('fake-barcode-camera');
    await act(async () => platform.emitBarcode('036000291452', 'upc_a'));
    await screen.findByTestId('barcode-product-name');
    expect(fetched.calls[0]!.url).toContain('/product/0036000291452?');
  });

  it('refuses a number with a wrong check digit, explains it, and sends nothing', async () => {
    await setup();
    await typeCode('3017624010702');
    await pressLookup();
    expect(await screen.findByText('That number is not a valid barcode. Check the digits and try again.')).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(0);
    expect(screen.getByLabelText('Barcode number').props.value).toBe('3017624010702'); // what was typed stays
  });

  it.each([
    ['', 'Type the barcode number.'],
    ['30a76', 'Use digits only.'],
    ['12345', 'A product barcode has 8, 12 or 13 digits.'],
  ])('explains %j', async (value, message) => {
    await setup();
    await typeCode(value);
    await pressLookup();
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(0);
  });

  it('ignores a camera read that is not a product barcode, and says so', async () => {
    await setup();
    await screen.findByTestId('fake-barcode-camera');
    await act(async () => platform.emitBarcode('https://example.test/qr', 'qr'));
    expect(await screen.findByText(/did not read a valid product barcode|not a valid product barcode/)).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(0);
  });
});

describe('without a usable camera', () => {
  it('explains the permission before asking, then shows the camera once allowed; typing works meanwhile', async () => {
    await setup({ permission: 'undetermined' });
    expect(await screen.findByText('Use the camera to read barcodes')).toBeOnTheScreen();
    expect(screen.queryByTestId('fake-barcode-camera')).toBeNull();
    await typeCode(NUTELLA_CODE); // the field is there already
    await press('Allow camera');
    expect(await screen.findByTestId('fake-barcode-camera')).toBeOnTheScreen();
  });

  it('a denied camera leaves the typed number working and offers the settings', async () => {
    await setup({ permission: 'denied' });
    expect(await screen.findByText('The camera is off for this app')).toBeOnTheScreen();
    await press('Open settings');
    expect(platform.state.settingsOpened).toBe(1);
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByTestId('barcode-product-name')).toBeOnTheScreen();
  });

  it('a camera that fails to start says so and keeps the field', async () => {
    const created = createFakeScanPlatform({ failBarcodeCamera: true });
    h = await createHarness();
    fetched = fakeFetch(nutellaResponse());
    services = createTestServices(h, { barcodeFetch: fetched.fetch });
    await services.barcode.acknowledgeNotice();
    await renderApp(<Flow />, { services, scanPlatform: created });
    expect(await screen.findByText('The camera could not start. You can type the number instead.')).toBeOnTheScreen();
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByTestId('barcode-product-name')).toBeOnTheScreen();
  });
});

describe('the first lookup tells where the number goes (S9)', () => {
  it('shows the notice once: nothing is sent before "Look up product", and it does not come back', async () => {
    await setup({ acknowledged: false });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByText('Send this number to Open Food Facts?')).toBeOnTheScreen();
    expect(screen.getByText(/the barcode number is sent to Open Food Facts/)).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('barcode-notice-decline')); // declining sends nothing and leaves the number in the field
    await waitFor(() => expect(screen.queryByText('Send this number to Open Food Facts?')).toBeNull());
    expect(fetched.calls).toHaveLength(0);
    expect(await services.barcode.noticeAcknowledged()).toBe(false);

    await pressLookup();
    await screen.findByText('Send this number to Open Food Facts?');
    await fireEvent.press(screen.getByTestId('barcode-notice-continue'));
    expect(await screen.findByTestId('barcode-product-name')).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(1);
    expect(await services.barcode.noticeAcknowledged()).toBe(true);

    // The next lookup goes straight through.
    await press('Scan another');
    await typeCode('96385074');
    await pressLookup();
    await waitFor(() => expect(fetched.calls).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText('Send this number to Open Food Facts?')).toBeNull());
  });

  it('is shown in Spanish, and a camera read waits for the answer too', async () => {
    await setup({ acknowledged: false, locale: 'es' });
    await screen.findByTestId('fake-barcode-camera');
    await act(async () => platform.emitBarcode(NUTELLA_CODE));
    expect(await screen.findByText('¿Enviar este número a Open Food Facts?')).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(0);
    await act(async () => platform.emitBarcode(NUTELLA_CODE)); // more reads while the notice is open change nothing
    expect(fetched.calls).toHaveLength(0);
  });
});

describe('a product that was found (S5)', () => {
  it('shows name, brand, values and the attribution, offers its serving size, and saves the amount with snapshots', async () => {
    await setup({ responders: [foundProduct({ product_name: 'Nutella', brands: 'Ferrero', serving_quantity: 15, nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sodium_100g: 0.043 } })] });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByText('Brand: Ferrero')).toBeOnTheScreen();
    expect(screen.getByText('539 kcal · P 6.3 · C 57.5 · F 30.9 per 100 g')).toBeOnTheScreen();
    expect(screen.getByText('Serving: 15 g')).toBeOnTheScreen();
    expect(screen.getByTestId('barcode-attribution')).toHaveTextContent(/Open Food Facts.*ODbL/);

    // The amount sheet opens by itself, starting from the serving; grams and the serving are both offered.
    const amount = await screen.findByLabelText('Amount in grams');
    expect(amount.props.value).toBe('15');
    expect(screen.getByRole('button', { name: 'Serving, 15 grams' })).toBeOnTheScreen();
    await fireEvent.changeText(amount, '30');
    expect(screen.getByText('162 kcal · 1.9 g protein · 17.3 g carbs · 9.3 g fat')).toBeOnTheScreen();
    await press('Add to meal');

    // Review, then save: the item is stored as a barcode food with its snapshot.
    expect(await screen.findByText('Nutella')).toBeOnTheScreen();
    expect(screen.getByText('Barcode')).toBeOnTheScreen();
    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay('2026-11-21')).meals).toHaveLength(1));
    const day = await h.repos.meals.getDay('2026-11-21');
    const item = day.meals[0]!.items[0]!;
    expect(item).toMatchObject({ foodSource: 'barcode', foodRef: NUTELLA_CODE, grams: 30, origin: 'manual' });
    expect(item.kcal).toBeCloseTo(161.7, 1);
    expect(item.proteinG).toBeCloseTo(1.89, 2);
    expect(item.nutrients.sodium).toBeCloseTo(12.9, 6);
    expect((await h.repos.foodUsage.recents(5)).map((r) => [r.foodSource, r.foodRef, r.lastGrams])).toEqual([['barcode', NUTELLA_CODE, 30]]);
    expect(await screen.findByTestId('day-title')).toBeOnTheScreen(); // Today
  });

  it('the product then shows in the recents of the search, tagged, and can be a favorite', async () => {
    await setup();
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    await fireEvent.changeText(await screen.findByLabelText('Amount in grams'), '20');
    await press('Add to meal');
    await screen.findByText('Review your meal');
    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay('2026-11-21')).meals).toHaveLength(1));
    await cleanup();

    await renderApp(<Flow start="search" />, { services, scanPlatform: platform });
    expect(await screen.findByText('Recent')).toBeOnTheScreen();
    expect(screen.getByText('Barcode')).toBeOnTheScreen();
    await press(/Add Nutella to favorites/);
    await waitFor(async () => expect((await h.repos.foodUsage.favorites()).map((f) => f.foodRef)).toEqual([NUTELLA_CODE]));
  });

  it('the search screen offers the barcode entry', async () => {
    await setup({ start: 'search' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Scan a barcode' }));
    expect(await screen.findByLabelText('Barcode number')).toBeOnTheScreen();
  });

  it('closing the amount sheet keeps the product, and "Choose amount" opens it again', async () => {
    await setup();
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    await screen.findByLabelText('Amount in grams');
    await press('Close');
    await waitFor(() => expect(screen.queryByLabelText('Amount in grams')).toBeNull());
    await press('Choose amount');
    expect(await screen.findByLabelText('Amount in grams')).toBeOnTheScreen();
  });

  it('a product saved on this phone works offline, and says when it could not be refreshed', async () => {
    await setup();
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    await screen.findByTestId('barcode-product-name');
    // Age the saved product past the refresh limit, then lose the network.
    h.client.exec(`UPDATE barcode_product SET fetched_at = '2026-01-01T00:00:00.000Z'`);
    fetched = fakeFetch(new Error('Network request failed'));
    await cleanup();
    services.close();
    services = createTestServices(h, { barcodeFetch: fetched.fetch });
    await services.barcode.acknowledgeNotice();
    await renderApp(<Flow />, { services, scanPlatform: platform });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByTestId('barcode-product-name')).toHaveTextContent('Nutella');
    expect(screen.getByTestId('barcode-stale')).toHaveTextContent(/Saved on this phone on/);
    expect(fetched.calls).toHaveLength(1);
  });
});

describe('a product that is incomplete or implausible (S5)', () => {
  it('shows what is missing, keeps what was reported, refuses to continue without the values, and never invents one', async () => {
    await setup({ responders: [foundProduct({ product_name: 'Mystery bar', nutriments: { proteins_100g: 3 } })] });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByText('This product is incomplete')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Amount in grams')).toBeNull(); // cannot be logged yet
    expect(screen.getByTestId('barcode-edit-protein').props.value).toBe('3');
    expect(screen.getByTestId('barcode-edit-kcal').props.value).toBe(''); // not 0
    expect(screen.getAllByText('Missing in Open Food Facts')).toHaveLength(3); // calories, carbs and fat

    await press('Use these values');
    expect(await screen.findByText('Fix the highlighted fields to continue.')).toBeOnTheScreen();
    expect(screen.getAllByText('Enter a number, like 12.5.')).toHaveLength(3);
    expect(await services.repos.barcodeProducts.get(NUTELLA_CODE)).toMatchObject({ edited: false });

    await fireEvent.changeText(screen.getByTestId('barcode-edit-kcal'), '350');
    await fireEvent.changeText(screen.getByTestId('barcode-edit-carbs'), '70');
    await fireEvent.changeText(screen.getByTestId('barcode-edit-fat'), '1500'); // out of range is explained, not clamped
    await press('Use these values');
    expect(await screen.findByText('Enter a number from 0 to 100.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('barcode-edit-fat'), '6');
    await press('Use these values');

    const amount = await screen.findByLabelText('Amount in grams');
    await fireEvent.changeText(amount, '40');
    expect(screen.getByText('140 kcal · 1.2 g protein · 28 g carbs · 2.4 g fat')).toBeOnTheScreen();
    expect(await h.repos.barcodeProducts.get(NUTELLA_CODE)).toMatchObject({ edited: true, missing: [], per100g: { kcal: 350, protein: 3, carbs: 70, fat: 6 } });
    await press('Add to meal');
    await screen.findByText('Review your meal');
    await press('Save meal');
    await waitFor(async () => expect((await h.repos.meals.getDay('2026-11-21')).meals).toHaveLength(1));
    expect((await h.repos.meals.getDay('2026-11-21')).meals[0]!.items[0]).toMatchObject({ foodSource: 'barcode', kcal: 140 });
  });

  it('asks for the name when the service has none', async () => {
    await setup({ responders: [foundProduct({ nutriments: { 'energy-kcal_100g': 100, proteins_100g: 5, carbohydrates_100g: 15, fat_100g: 2 } })] });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    await screen.findByText('This product is incomplete');
    await press('Use these values');
    expect(await screen.findByText('Enter a name.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('barcode-edit-name'), 'My snack');
    await press('Use these values');
    expect(await screen.findByLabelText('Amount in grams')).toBeOnTheScreen();
    expect(await h.repos.barcodeProducts.get(NUTELLA_CODE)).toMatchObject({ name: 'My snack', edited: true });
  });

  it('shows an implausible product as incomplete, with the reported values editable', async () => {
    await setup({ responders: [foundProduct({ product_name: 'Odd', nutriments: { 'energy-kcal_100g': 900, proteins_100g: 5, carbohydrates_100g: 5, fat_100g: 5 } })] });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByTestId('barcode-inconsistent')).toHaveTextContent(/The calories do not match/);
    expect(screen.getByTestId('barcode-edit-kcal').props.value).toBe('900');
    expect(screen.queryByText('Missing in Open Food Facts')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('barcode-edit-kcal'), '85');
    await press('Use these values');
    expect(await screen.findByLabelText('Amount in grams')).toBeOnTheScreen();
  });
});

describe('failures, each with its own message', () => {
  const cases: [string, Parameters<typeof fakeFetch>[0], string, string][] = [
    ['not found', notFoundResponse(), 'Product not found', 'Open Food Facts has no product with this barcode. Check the number, or create the food yourself.'],
    ['no network', new Error('Network request failed'), 'No connection', 'This product could not be looked up without internet. Products you looked up before are saved on this phone and work offline.'],
    ['rate limited', res(429, 'slow down', { 'Retry-After': '30' }), 'Too many lookups', 'Open Food Facts allows a limited number of lookups per minute. Try again in 30 seconds.'],
    ['rate limited without a wait', res(429, 'slow down'), 'Too many lookups', 'Open Food Facts allows a limited number of lookups per minute. Wait a moment and try again.'],
    ['a service error', res(503, 'down'), 'The service had a problem', 'Open Food Facts did not answer correctly. Try again in a few minutes, or create the food yourself.'],
  ];

  it.each(cases)('%s', async (_name, answer, title, message) => {
    await setup({ responders: [answer] });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByText(title)).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(1);
    expect(await h.client.prepare('SELECT * FROM barcode_product').all()).toHaveLength(0);
  });

  it('"Try again" asks once more; a later success shows the product', async () => {
    await setup({ responders: [res(503, 'down'), nutellaResponse()] });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    await screen.findByText('The service had a problem');
    await press('Try again');
    expect(await screen.findByTestId('barcode-product-name')).toBeOnTheScreen();
    expect(fetched.calls).toHaveLength(2);
  });

  it('"Type another number" returns to the field with the number still in it, and "Create custom food" hands over to that screen', async () => {
    await setup({ responders: [notFoundResponse()] });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    await screen.findByText('Product not found');
    await press('Create custom food');
    expect(onCreateCustom).toHaveBeenCalledTimes(1);
    await press('Type another number');
    expect((await input()).props.value).toBe(NUTELLA_CODE);
  });

  it('shows the loading state with Cancel; cancelling returns to the entry and the late answer is ignored', async () => {
    await setup({ responders: [hangingResponder] });
    await typeCode(NUTELLA_CODE);
    await pressLookup();
    expect(await screen.findByTestId('barcode-loading')).toBeOnTheScreen();
    expect(screen.getByText(`Looking up ${NUTELLA_CODE}`)).toBeOnTheScreen();
    await press('Cancel');
    expect(await input()).toBeOnTheScreen();
    expect(screen.queryByTestId('barcode-loading')).toBeNull();
    expect(screen.queryByTestId('barcode-product-name')).toBeNull();
  });

  it('every failure code has its texts in English and Spanish', () => {
    for (const code of ['not_found', 'no_network', 'timeout', 'rate_limited', 'service_error', 'invalid_code']) {
      for (const lng of ['en', 'es']) {
        expect(i18n.getFixedT(lng)(`barcode.failure.${code}.title`)).not.toBe(`barcode.failure.${code}.title`);
        expect(i18n.getFixedT(lng)(`barcode.failure.${code}.message`)).not.toBe(`barcode.failure.${code}.message`);
      }
    }
  });
});

describe('Spanish', () => {
  it('shows the entry, the product and the attribution in Spanish', async () => {
    await setup({ locale: 'es' });
    await fireEvent.changeText(await screen.findByLabelText('Número del código de barras'), NUTELLA_CODE);
    await fireEvent.press(screen.getByTestId('barcode-lookup'));
    expect(await screen.findByText('Producto encontrado')).toBeOnTheScreen();
    expect(screen.getByTestId('barcode-attribution')).toHaveTextContent(/Open Food Facts.*ODbL/);
  });
});
