import { CancelledError } from '@/core/ai';
import { fakeFetch, hangingResponder, res } from '@/core/ai/__fixtures__/fixtures';
import { createOpenFoodFactsClient, BarcodeLookupError, OFF_FIELDS, OFF_HOST } from '..';
import { NUTELLA_CODE, foundProduct, notFoundResponse, nutellaResponse } from '../__fixtures__/off';

const UA = 'QbitNutrition/0.0.1 (https://github.com/qbitdevz/qbit-nutrition)';
const lookup = (fetch: ReturnType<typeof fakeFetch>['fetch'], signal = new AbortController().signal) =>
  createOpenFoodFactsClient({ fetch, userAgent: UA, timeoutMs: 50 }).lookup(NUTELLA_CODE, signal);

async function failureOf(promise: Promise<unknown>): Promise<BarcodeLookupError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BarcodeLookupError);
    return error as BarcodeLookupError;
  }
  throw new Error('expected the lookup to fail');
}

describe('Open Food Facts client: the request', () => {
  it('sends one GET with the fields parameter, the identifying User-Agent, and nothing else', async () => {
    const { fetch, calls } = fakeFetch(nutellaResponse());
    await lookup(fetch);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: `https://world.openfoodfacts.org/api/v2/product/${NUTELLA_CODE}?fields=${OFF_FIELDS}`,
      method: 'GET',
      redirect: 'error',
      rawBody: undefined,
    });
    // Exactly these headers: no key, no cookie, no authorization, nothing that identifies the person.
    expect(calls[0]!.headers).toEqual({ 'User-Agent': UA, Accept: 'application/json' });
  });

  it('asks only for names, serving size and nutriments', () => {
    expect(OFF_HOST).toBe('https://world.openfoodfacts.org');
    expect(OFF_FIELDS.split(',').sort()).toEqual(
      ['brands', 'code', 'nutriments', 'nutrition_data_per', 'product_name', 'product_name_en', 'product_name_es', 'serving_quantity', 'serving_quantity_unit', 'serving_size'].sort(),
    );
  });

  it('puts only digits in the path: a code that is not a plain barcode is refused before any request', async () => {
    const { fetch, calls } = fakeFetch(nutellaResponse());
    const client = createOpenFoodFactsClient({ fetch, userAgent: UA });
    const error = await failureOf(client.lookup('../../etc/passwd', new AbortController().signal));
    expect(error.code).toBe('invalid_code');
    expect(calls).toHaveLength(0);
  });
});

describe('Open Food Facts client: the answers', () => {
  it('returns the validated product for a found barcode', async () => {
    const { fetch } = fakeFetch(nutellaResponse());
    const product = await lookup(fetch);
    expect(product.product_name).toBe('Nutella');
    expect(product.brands).toBe('Ferrero');
    expect(product.nutriments['energy-kcal_100g']).toBe(539);
  });

  it('keeps going when crowd-sourced fields have the wrong type, and drops them', async () => {
    const { fetch } = fakeFetch(foundProduct({ product_name: 42, brands: ['a'], nutriments: { fat_100g: '30,9' } }));
    const product = await lookup(fetch);
    expect(product.product_name).toBeUndefined();
    expect(product.brands).toBeUndefined();
    expect(product.nutriments.fat_100g).toBe('30,9');
  });

  it.each([
    ['a 404 with status 0', notFoundResponse()],
    ['a 200 with status 0', res(200, { code: NUTELLA_CODE, status: 0, status_verbose: 'product not found' })],
  ])('says "not found" for %s', async (_label, response) => {
    const { fetch, calls } = fakeFetch(response);
    expect((await failureOf(lookup(fetch))).code).toBe('not_found');
    expect(calls).toHaveLength(1); // never retried
  });

  it('says "rate limited" for HTTP 429 and reads Retry-After', async () => {
    const { fetch, calls } = fakeFetch(res(429, 'Too Many Requests', { 'Retry-After': '30' }));
    const error = await failureOf(lookup(fetch));
    expect(error.code).toBe('rate_limited');
    expect(error.retryAfterS).toBe(30);
    expect(calls).toHaveLength(1);
  });

  it.each([500, 502, 503, 418])('says "service error" for HTTP %i, with one request only', async (status) => {
    const { fetch, calls } = fakeFetch(res(status, 'oops'));
    expect((await failureOf(lookup(fetch))).code).toBe('service_error');
    expect(calls).toHaveLength(1);
  });

  it('says "service error" for an answer that is not JSON, or a found answer without a product', async () => {
    expect((await failureOf(lookup(fakeFetch(res(200, '<html>maintenance</html>')).fetch))).code).toBe('service_error');
    expect((await failureOf(lookup(fakeFetch(res(200, { status: 1, code: NUTELLA_CODE })).fetch))).code).toBe('service_error');
    expect((await failureOf(lookup(fakeFetch(res(200, ['x'])).fetch))).code).toBe('service_error');
  });

  it('says "no network" when the request never reaches a server', async () => {
    const { fetch, calls } = fakeFetch(new Error('Network request failed'));
    expect((await failureOf(lookup(fetch))).code).toBe('no_network');
    expect(calls).toHaveLength(1);
  });

  it('refuses a redirect (service error) and never follows it', async () => {
    const { fetch } = fakeFetch(new Error('Redirect is not allowed when redirect mode is error'));
    expect((await failureOf(lookup(fetch))).code).toBe('service_error');
  });

  it('times out with its own code when the service does not answer', async () => {
    const { fetch } = fakeFetch(hangingResponder);
    expect((await failureOf(lookup(fetch))).code).toBe('timeout');
  });

  it('is cancellable', async () => {
    const { fetch } = fakeFetch(hangingResponder);
    const abort = new AbortController();
    const pending = createOpenFoodFactsClient({ fetch, userAgent: UA, timeoutMs: 5000 }).lookup(NUTELLA_CODE, abort.signal);
    abort.abort();
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
  });
});
