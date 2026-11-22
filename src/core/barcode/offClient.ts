// Open Food Facts product lookup (docs/09 section 2.6). The service documents this API at
// https://openfoodfacts.github.io/openfoodfacts-server/api/ : read requests need no authentication, only an identifying
// User-Agent of the form AppName/Version (contact); 15 product reads per minute per IP (per user for a mobile app).
//
// One lookup is one request: no retry, no search, no batching. The request carries the barcode in the path and
// nothing else: no key, no cookie, no body, no identifier. The fetch is injected: the app gives it a redirect-refusing one.
import { CancelledError } from '../ai/errors';
import type { FetchLike } from '../ai/types';
import { BarcodeLookupError } from './errors';
import { OffResponseSchema, type OffProduct } from './offSchema';

export const OFF_HOST = 'https://world.openfoodfacts.org';

/** Names, serving size and nutriments, as docs/09 section 2.6 asks. Nothing about people, images, or history. */
export const OFF_FIELDS = 'code,product_name,product_name_en,product_name_es,brands,serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriments';

/** The service has no deadline of its own; a lookup the person is waiting on gives up after this long. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface OpenFoodFactsOptions {
  fetch: FetchLike;
  /** `AppName/Version (contact URL)`, as the service asks API clients to identify themselves. */
  userAgent: string;
  timeoutMs?: number;
}

export interface OpenFoodFactsClient {
  /**
   * Looks up one barcode (digits only; the caller has validated the check digit). Resolves with the
   * validated product; rejects with `BarcodeLookupError`, or `CancelledError` when `signal` aborts.
   */
  lookup(barcode: string, signal: AbortSignal): Promise<OffProduct>;
}

function retryAfter(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

export function createOpenFoodFactsClient(options: OpenFoodFactsOptions): OpenFoodFactsClient {
  const { userAgent, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  return {
    async lookup(barcode, signal) {
      // The code goes into a URL path: only plain digits may.
      if (!/^\d{8}$|^\d{13}$/.test(barcode)) throw new BarcodeLookupError('invalid_code');
      if (signal.aborted) throw new CancelledError();

      const timer = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        timer.abort();
      }, timeoutMs);
      const onCancel = () => timer.abort();
      signal.addEventListener('abort', onCancel, { once: true });

      try {
        const attempt = (async () => {
          const response = await options.fetch(`${OFF_HOST}/api/v2/product/${barcode}?fields=${OFF_FIELDS}`, {
            method: 'GET',
            headers: { 'User-Agent': userAgent, Accept: 'application/json' },
            redirect: 'error',
            signal: timer.signal,
          });
          return { status: response.status, headers: response.headers, body: await response.text() };
        })();
        attempt.catch(() => undefined); // a late failure after an abort must not surface as unhandled
        const aborted = new Promise<never>((_resolve, reject) => {
          if (timer.signal.aborted) reject(new Error('aborted'));
          timer.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        aborted.catch(() => undefined);
        const answer = await Promise.race([attempt, aborted]);
        return interpret(answer);
      } catch (error) {
        if (error instanceof BarcodeLookupError) throw error;
        if (signal.aborted) throw new CancelledError();
        if (timedOut) throw new BarcodeLookupError('timeout');
        // A refused redirect is the service misbehaving (or something in the way), not a missing connection.
        if (/redirect/i.test(error instanceof Error ? error.message : String(error))) throw new BarcodeLookupError('service_error');
        throw new BarcodeLookupError('no_network');
      } finally {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onCancel);
      }
    },
  };
}

function interpret(answer: { status: number; headers: { get(name: string): string | null }; body: string }): OffProduct {
  if (answer.status === 404) throw new BarcodeLookupError('not_found');
  if (answer.status === 429) throw new BarcodeLookupError('rate_limited', { retryAfterS: retryAfter(answer.headers.get('retry-after')) });
  if (answer.status < 200 || answer.status >= 300) throw new BarcodeLookupError('service_error');

  let json: unknown;
  try {
    json = JSON.parse(answer.body);
  } catch {
    throw new BarcodeLookupError('service_error');
  }
  const parsed = OffResponseSchema.safeParse(json);
  if (!parsed.success) throw new BarcodeLookupError('service_error');
  if (Number(parsed.data.status) === 0) throw new BarcodeLookupError('not_found');
  if (!parsed.data.product) throw new BarcodeLookupError('service_error');
  return parsed.data.product;
}
