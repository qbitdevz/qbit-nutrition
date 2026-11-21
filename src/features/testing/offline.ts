import type { FetchLike } from '@/core/ai/types';

/** Test-only: the network is down. Screen tests that need a provider pass their own fake (`fakeFetch` from the core fixtures). */
export const offlineFetch: FetchLike = async () => {
  throw new Error('Network request failed');
};
