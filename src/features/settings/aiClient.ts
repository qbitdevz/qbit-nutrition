import { createVisionGateway } from '@/core/ai';
import type { FetchLike } from '@/core/ai/types';
import { createRedirectSafeFetch } from '@/platform/safeFetch';

export type AiClient = ReturnType<typeof createVisionGateway>;

export interface AiClientOptions {
  /** The platform fetch (`deviceFetch` on a device); a fake in tests. */
  fetch: FetchLike;
  /** Pause before the one retry on a server error or a network failure; tests set 0. */
  retryDelayMs?: number;
}

/**
 * The one place `core/ai` is given its network access. The fetch is ALWAYS wrapped in the
 * redirect-safe wrapper (S10), so no caller, screen, or test double can reach a provider without it.
 */
export function createAiClient({ fetch, retryDelayMs }: AiClientOptions): AiClient {
  return createVisionGateway({
    fetch: createRedirectSafeFetch(fetch),
    ...(retryDelayMs !== undefined ? { retryDelayMs, sleep: retryDelayMs === 0 ? async () => undefined : undefined } : {}),
  });
}
