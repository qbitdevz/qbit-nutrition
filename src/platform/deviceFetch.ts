import { fetch as expoFetch } from 'expo/fetch';

import type { FetchLike } from '@/core/ai/types';

/**
 * The fetch for a device: `expo/fetch`, which honors `redirect: 'error'` on Android and iOS (see
 * `safeFetch.ts`). Never the global `fetch`, which ignores that option on Android. `core/ai` applies
 * `createRedirectSafeFetch` on top of it.
 */
export const deviceFetch: FetchLike = (url, init) => expoFetch(url, init);
