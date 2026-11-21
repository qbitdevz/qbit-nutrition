import { createOpenFoodFactsClient, type OpenFoodFactsClient } from '@/core/barcode';
import type { FetchLike } from '@/core/ai/types';
import { createRedirectSafeFetch } from '@/platform/safeFetch';

export interface BarcodeClientOptions {
  /** The platform fetch (`deviceFetch` on a device); a fake in tests. */
  fetch: FetchLike;
  /** `AppName/Version (contact URL)`. */
  userAgent: string;
  timeoutMs?: number;
}

/**
 * The one place the Open Food Facts client is given its network access (the AI client's is `settings/aiClient.ts`).
 * The fetch is ALWAYS wrapped in the redirect-safe wrapper (S10), so nothing that reaches the network here can follow a
 * redirect. The request carries the barcode and nothing else: no key, no cookie, no identifier (`core/barcode/offClient.ts`).
 */
export function createBarcodeClient({ fetch, userAgent, timeoutMs }: BarcodeClientOptions): OpenFoodFactsClient {
  return createOpenFoodFactsClient({ fetch: createRedirectSafeFetch(fetch), userAgent, timeoutMs });
}
