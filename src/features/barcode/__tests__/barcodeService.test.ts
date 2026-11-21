/** @jest-environment node */
import { CancelledError } from '@/core/ai';
import { fakeFetch, res } from '@/core/ai/__fixtures__/fixtures';
import { BarcodeLookupError } from '@/core/barcode';
import { NUTELLA_CODE, foundProduct, notFoundResponse, nutellaResponse } from '@/core/barcode/__fixtures__/off';
import { createHarness, type Harness } from '@/data/testing/harness';
import { createBarcodeClient } from '../barcodeClient';
import { BARCODE_CACHE_MAX_AGE_DAYS, LOOKUP_LIMIT } from '../constants';
import { createBarcodeService, type BarcodeService } from '../barcodeService';

const UA = 'QbitNutrition/0.0.1 (https://github.com/qbitdevz/qbit-nutrition)';
const DAY = 86_400_000;
const signal = () => new AbortController().signal;

let h: Harness;
let clock: number;
beforeEach(async () => {
  h = await createHarness();
  clock = Date.parse('2026-11-21T12:00:00.000Z');
});
afterEach(() => h.close());

function setup(...responders: Parameters<typeof fakeFetch>) {
  const fake = fakeFetch(...responders);
  const service: BarcodeService = createBarcodeService({
    repos: h.repos,
    client: createBarcodeClient({ fetch: fake.fetch, userAgent: UA, timeoutMs: 200 }),
    now: () => new Date(clock),
  });
  return { ...fake, service };
}

const lookup = (service: BarcodeService, code = NUTELLA_CODE, locale: 'en' | 'es' = 'en') => service.lookup(code, { locale, signal: signal() });
const cachedRows = () => h.client.prepare('SELECT * FROM barcode_product').all() as Record<string, unknown>[];

async function failureOf(promise: Promise<unknown>): Promise<BarcodeLookupError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BarcodeLookupError);
    return error as BarcodeLookupError;
  }
  throw new Error('expected the lookup to fail');
}

describe('a lookup', () => {
  it('sends exactly one request, with the barcode and nothing that identifies the person, and caches the product with its fetch time', async () => {
    const { service, calls } = setup(nutellaResponse());
    const outcome = await lookup(service);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain(`/api/v2/product/${NUTELLA_CODE}?fields=`);
    expect(calls[0]!.headers).toEqual({ 'User-Agent': UA, Accept: 'application/json' }); // no key, no cookie, no token
    expect(calls[0]!.rawBody).toBeUndefined();
    expect(calls[0]!.redirect).toBe('error');

    expect(outcome).toMatchObject({ source: 'network', stale: false, product: { barcode: NUTELLA_CODE, name: 'Nutella', brand: 'Ferrero', missing: [], inconsistent: false } });
    expect(outcome.product.per100g).toMatchObject({ kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sodium: 43 });
    expect(cachedRows()).toHaveLength(1);
    expect(await h.repos.barcodeProducts.get(NUTELLA_CODE)).toEqual({ ...outcome.product, fetchedAt: '2026-11-21T12:00:00.000Z' });
  });

  it('validates the check digit first: a wrong number costs no request', async () => {
    const { service, calls } = setup(nutellaResponse());
    expect((await failureOf(lookup(service, '3017624010702'))).code).toBe('invalid_code');
    expect((await failureOf(lookup(service, '123'))).code).toBe('invalid_code');
    expect(calls).toHaveLength(0);
  });

  it('looks up a UPC-A as the EAN-13 with a leading zero, and caches it under that code', async () => {
    const { service, calls } = setup(foundProduct({ product_name: 'Cola', nutriments: { 'energy-kcal_100g': 42, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 } }, '0036000291452'));
    await lookup(service, '036000291452');
    expect(calls[0]!.url).toContain('/product/0036000291452?');
    expect(await h.repos.barcodeProducts.get('0036000291452')).not.toBeNull();
  });

  it('names the product in the app language when the service has it', async () => {
    const { service } = setup(foundProduct({ product_name: 'Hazelnut spread', product_name_es: 'Crema de avellanas', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } }));
    expect((await lookup(service, NUTELLA_CODE, 'es')).product.name).toBe('Crema de avellanas');
  });

  it('caches an incomplete product as incomplete (the missing values stay missing)', async () => {
    const { service } = setup(foundProduct({ product_name: 'Mystery bar', nutriments: { proteins_100g: 3 } }));
    const { product } = await lookup(service);
    expect(product.missing).toEqual(['kcal', 'carbs', 'fat']);
    expect((await h.repos.barcodeProducts.get(NUTELLA_CODE))!.per100g).toEqual({ protein: 3 });
  });

  it('says "not found" and caches nothing for it', async () => {
    const { service, calls } = setup(notFoundResponse());
    expect((await failureOf(lookup(service))).code).toBe('not_found');
    expect(calls).toHaveLength(1);
    expect(cachedRows()).toHaveLength(0);
  });

  it.each([
    ['rate limited', res(429, 'slow down', { 'retry-after': '20' }), 'rate_limited'],
    ['a service error', res(503, 'down'), 'service_error'],
    ['no network', new Error('Network request failed'), 'no_network'],
  ] as const)('says "%s" when there is nothing saved to show', async (_label, answer, code) => {
    const { service, calls } = setup(answer);
    expect((await failureOf(lookup(service))).code).toBe(code);
    expect(calls).toHaveLength(1); // no retry
    expect(cachedRows()).toHaveLength(0);
  });

  it('is cancellable', async () => {
    const { service } = setup(new Error('x'));
    const abort = new AbortController();
    abort.abort();
    await expect(service.lookup(NUTELLA_CODE, { locale: 'en', signal: abort.signal })).rejects.toBeInstanceOf(CancelledError);
  });
});

describe('the cache', () => {
  it('serves a fresh product without any request', async () => {
    const { service, calls } = setup(nutellaResponse());
    await lookup(service);
    clock += (BARCODE_CACHE_MAX_AGE_DAYS - 1) * DAY;
    const again = await lookup(service);
    expect(calls).toHaveLength(1);
    expect(again).toMatchObject({ source: 'cache', stale: false, product: { name: 'Nutella' } });
  });

  it('serves a product offline: even past its age, when the refresh cannot reach the service (marked as not refreshed)', async () => {
    const { service, calls } = setup(nutellaResponse(), new Error('Network request failed'));
    await lookup(service);
    clock += (BARCODE_CACHE_MAX_AGE_DAYS + 5) * DAY;
    const again = await lookup(service);
    expect(calls).toHaveLength(2); // one try at refreshing
    expect(again).toMatchObject({ source: 'cache', stale: true, product: { name: 'Nutella', fetchedAt: '2026-11-21T12:00:00.000Z' } });
  });

  it('refreshes a product older than the limit, and keeps the new values and the new fetch time', async () => {
    const changed = foundProduct({ product_name: 'Nutella', brands: 'Ferrero', nutriments: { 'energy-kcal_100g': 541, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 31 } });
    const { service, calls } = setup(nutellaResponse(), changed);
    await lookup(service);
    clock += BARCODE_CACHE_MAX_AGE_DAYS * DAY + 1;
    const again = await lookup(service);
    expect(calls).toHaveLength(2);
    expect(again).toMatchObject({ source: 'network', stale: false, product: { per100g: expect.objectContaining({ kcal: 541, fat: 31 }) } });
    expect(cachedRows()).toHaveLength(1);
    expect((await h.repos.barcodeProducts.get(NUTELLA_CODE))!.fetchedAt).toBe(new Date(clock).toISOString());
  });

  it.each([
    ['rate limited', res(429, 'x')],
    ['a service error', res(500, 'x')],
    ['gone from the service', notFoundResponse()],
  ])('keeps serving the saved product when a refresh finds %s', async (_label, answer) => {
    const { service } = setup(nutellaResponse(), answer);
    await lookup(service);
    clock += (BARCODE_CACHE_MAX_AGE_DAYS + 1) * DAY;
    expect(await lookup(service)).toMatchObject({ source: 'cache', stale: true, product: { name: 'Nutella' } });
  });

  it('keeps what the person completed: a refresh that is still incomplete does not erase their values, a complete one replaces them', async () => {
    const incomplete = foundProduct({ product_name: 'Mystery bar', nutriments: { proteins_100g: 3 } });
    const complete = foundProduct({ product_name: 'Mystery bar', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 3, carbohydrates_100g: 80, fat_100g: 6 } });
    const { service, calls } = setup(incomplete, incomplete, complete);
    await lookup(service);
    await service.saveEdited(NUTELLA_CODE, { name: 'Mystery bar', kcal: 350, protein: 3, carbs: 70, fat: 6 });
    expect(await h.repos.barcodeProducts.get(NUTELLA_CODE)).toMatchObject({ edited: true, missing: [], inconsistent: false, per100g: { kcal: 350, carbs: 70 } });

    clock += (BARCODE_CACHE_MAX_AGE_DAYS + 1) * DAY;
    expect(await lookup(service)).toMatchObject({ product: { edited: true, per100g: expect.objectContaining({ kcal: 350 }) } });
    expect(calls).toHaveLength(2);

    clock += (BARCODE_CACHE_MAX_AGE_DAYS + 1) * DAY;
    expect(await lookup(service)).toMatchObject({ product: { edited: false, per100g: expect.objectContaining({ kcal: 400 }) } });
  });
});

describe('saving the person\'s corrections', () => {
  it('stores the completed values on the cached product, so a saved item can be recalculated from them', async () => {
    const { service } = setup(foundProduct({ product_name: '', nutriments: { proteins_100g: 3 } }));
    await lookup(service);
    const saved = await service.saveEdited(NUTELLA_CODE, { name: 'My bar', kcal: 350, protein: 3, carbs: 70, fat: 6 });
    expect(saved).toMatchObject({ name: 'My bar', missing: [], edited: true, per100g: { kcal: 350, protein: 3, carbs: 70, fat: 6 } });
    expect(await h.repos.barcodeProducts.get(NUTELLA_CODE)).toEqual(saved);
  });

  it('refuses values outside what a food can have, and a product that was never looked up', async () => {
    const { service } = setup(foundProduct({ product_name: 'x', nutriments: {} }));
    await expect(service.saveEdited(NUTELLA_CODE, { name: 'x', kcal: 1, protein: 1, carbs: 1, fat: 1 })).rejects.toThrow();
    await lookup(service);
    await expect(service.saveEdited(NUTELLA_CODE, { name: 'x', kcal: 5000, protein: 1, carbs: 1, fat: 1 })).rejects.toThrow();
    await expect(service.saveEdited(NUTELLA_CODE, { name: '  ', kcal: 1, protein: 1, carbs: 1, fat: 1 })).rejects.toThrow();
  });
});

describe('the limit of the service (15 product reads a minute)', () => {
  const codes = Array.from({ length: LOOKUP_LIMIT.perWindow + 1 }, (_, i) => {
    const body = String(100000000000 + i).padStart(12, '0');
    const sum = [...body].reduce((s, d, k) => s + Number(d) * (k % 2 === 0 ? 1 : 3), 0);
    return `${body}${(10 - (sum % 10)) % 10}`;
  });

  it('stops asking after 15 lookups in a minute without sending the 16th, then allows lookups again', async () => {
    const { service, calls } = setup(foundProduct({ product_name: 'x', nutriments: { 'energy-kcal_100g': 1, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 } }));
    for (const code of codes.slice(0, 15)) await lookup(service, code);
    expect(calls).toHaveLength(15);
    const error = await failureOf(lookup(service, codes[15]));
    expect(error.code).toBe('rate_limited');
    expect(error.retryAfterS).toBeGreaterThan(0);
    expect(calls).toHaveLength(15);

    clock += 61_000;
    await lookup(service, codes[15]);
    expect(calls).toHaveLength(16);
  });

  it('does not count what the cache served', async () => {
    const { service, calls } = setup(nutellaResponse());
    for (let i = 0; i < 40; i++) await lookup(service);
    expect(calls).toHaveLength(1);
  });
});

describe('the one-time notice (S9)', () => {
  it('is unacknowledged at first, and acknowledged for good after the person continues', async () => {
    const { service } = setup(nutellaResponse());
    expect(await service.noticeAcknowledged()).toBe(false);
    await service.acknowledgeNotice();
    expect(await service.noticeAcknowledged()).toBe(true);
    expect(Object.keys(await h.repos.settings.getAll())).toEqual(['notice_ack.barcode']);
  });
});
