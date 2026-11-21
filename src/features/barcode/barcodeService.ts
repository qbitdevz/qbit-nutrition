import { CancelledError } from '@/core/ai';
import {
  BarcodeLookupError,
  MAX_GRAMS_100G,
  MAX_KCAL_100G,
  isComplete,
  mapProduct,
  parseBarcode,
  type OpenFoodFactsClient,
} from '@/core/barcode';
import type { BarcodeProductRecord, Repositories } from '@/data';
import type { Locale } from '@/i18n/locale';
import { BARCODE_CACHE_MAX_AGE_MS, BARCODE_NOTICE_KEY, LOOKUP_LIMIT } from './constants';

export interface LookupOutcome {
  product: BarcodeProductRecord;
  /** `network`: just fetched. `cache`: served from this phone. */
  source: 'network' | 'cache';
  /** The product is older than the refresh age and the refresh did not succeed: what is shown may be out of date. */
  stale: boolean;
}

/** What the person typed to complete an incomplete product. */
export interface ProductCorrections {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface BarcodeService {
  /**
   * One barcode, one user action. Validates the check digit first (nothing is sent for a wrong number), serves a
   * cached product that is younger than `BARCODE_CACHE_MAX_AGE_DAYS`, and otherwise makes ONE request. A refresh that
   * fails serves the saved product instead of an error. Rejects with `BarcodeLookupError`, or `CancelledError`.
   */
  lookup(input: string, options: { locale: Locale; signal: AbortSignal }): Promise<LookupOutcome>;
  /** Stores what the person typed for a product (its name and four headline values) as theirs; the product is then complete. */
  saveEdited(barcode: string, corrections: ProductCorrections): Promise<BarcodeProductRecord>;
  /** The one-time "this number is sent to Open Food Facts" notice (S9). */
  noticeAcknowledged(): Promise<boolean>;
  acknowledgeNotice(): Promise<void>;
}

export interface BarcodeServiceDeps {
  repos: Pick<Repositories, 'barcodeProducts' | 'settings'>;
  client: OpenFoodFactsClient;
  now?: () => Date;
}

export function createBarcodeService({ repos, client, now = () => new Date() }: BarcodeServiceDeps): BarcodeService {
  /** When each request left this phone, newest last, inside the limit's window. */
  let sent: number[] = [];

  /** Seconds until another request may be sent; 0 when one may go now. */
  const waitS = (at: number): number => {
    sent = sent.filter((t) => at - t < LOOKUP_LIMIT.windowMs);
    return sent.length < LOOKUP_LIMIT.perWindow ? 0 : Math.ceil((sent[0]! + LOOKUP_LIMIT.windowMs - at) / 1000);
  };

  return {
    async lookup(input, { locale, signal }) {
      const parsed = parseBarcode(input);
      if (!parsed.ok) throw new BarcodeLookupError('invalid_code');
      if (signal.aborted) throw new CancelledError();
      const code = parsed.code;

      const cached = await repos.barcodeProducts.get(code);
      const at = now().getTime();
      if (cached && at - Date.parse(cached.fetchedAt) < BARCODE_CACHE_MAX_AGE_MS) return { product: cached, source: 'cache', stale: false };

      const serveSaved = (): LookupOutcome | null => (cached ? { product: cached, source: 'cache', stale: true } : null);

      const wait = waitS(at);
      if (wait > 0) {
        const saved = serveSaved();
        if (saved) return saved;
        throw new BarcodeLookupError('rate_limited', { retryAfterS: wait });
      }

      sent.push(at);
      let raw;
      try {
        raw = await client.lookup(code, signal);
      } catch (error) {
        if (error instanceof BarcodeLookupError) {
          const saved = serveSaved();
          if (saved) return saved; // a refresh that fails is not an error when something is saved
        }
        throw error;
      }

      const fetchedAt = now().toISOString();
      const fresh = { ...mapProduct(raw, locale), barcode: code, edited: false };
      // The person completed this product: a fresh answer that is still incomplete must not erase their values.
      if (cached?.edited && !isComplete(fresh)) {
        const kept = { ...cached, fetchedAt };
        await repos.barcodeProducts.put(kept);
        return { product: kept, source: 'cache', stale: false };
      }
      const product: BarcodeProductRecord = { ...fresh, fetchedAt };
      await repos.barcodeProducts.put(product);
      return { product, source: 'network', stale: false };
    },

    async saveEdited(barcode, { name, kcal, protein, carbs, fat }) {
      const cached = await repos.barcodeProducts.get(barcode);
      if (!cached) throw new Error('This product was not looked up; there is nothing to complete.');
      if (name.trim() === '') throw new RangeError('A product needs a name.');
      const inRange = (value: number, max: number) => Number.isFinite(value) && value >= 0 && value <= max;
      if (!inRange(kcal, MAX_KCAL_100G) || ![protein, carbs, fat].every((value) => inRange(value, MAX_GRAMS_100G))) {
        throw new RangeError('A value is outside what a food can have per 100 g.');
      }
      const product: BarcodeProductRecord = {
        ...cached,
        name: name.replace(/\s+/g, ' ').trim().slice(0, 120),
        per100g: { ...cached.per100g, kcal, protein, carbs, fat },
        missing: [],
        inconsistent: false,
        edited: true,
      };
      await repos.barcodeProducts.put(product);
      return product;
    },

    async noticeAcknowledged() {
      return (await repos.settings.get(BARCODE_NOTICE_KEY)) !== null;
    },

    async acknowledgeNotice() {
      await repos.settings.set(BARCODE_NOTICE_KEY, now().toISOString());
    },
  };
}
