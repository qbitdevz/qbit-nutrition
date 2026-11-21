import { openServicesOnce } from './openServicesCore';
import { withWebSearchFallback } from './webFtsFallback';
import type { AppServices } from './types';

/**
 * DEVELOPMENT ONLY: in the browser preview the AI client talks to a fake provider and keeps its key in
 * memory, so the scan screens can be walked through without a key. This file is not part of any
 * Android or iOS bundle, and the modules it loads sit behind `__DEV__`.
 */
function devAi() {
  if (!__DEV__) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dev = require('../scan/dev/devServices') as typeof import('../scan/dev/devServices');
  const options = dev.devAiOptions();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const health = (require('../health/dev/devHealthPlatform') as typeof import('../health/dev/devHealthPlatform')).createDevHealthPlatform();
  return { ...options, health, afterOpen: (services: AppServices) => dev.seedDevProvider(services.repos, options.secrets) };
}

const WORKER_LOADING = /worker has not finished loading/i;
const RETRY_EVERY_MS = 250;
const GIVE_UP_AFTER_MS = 15_000;

/**
 * Web preview only (`npm run web`). `expo-sqlite` on the web runs SQLite in a worker that loads
 * asynchronously, and its first synchronous call fails with a "worker has not finished loading"
 * message until it is up. Retry that one error for a few seconds; any other failure (a failed
 * migration, a missing catalog) is reported at once. Android and iOS use `openServices.ts`.
 */
export async function openAppServices(): Promise<AppServices> {
  const startedAt = Date.now();
  for (;;) {
    try {
      return await openServicesOnce(withWebSearchFallback, devAi());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const waiting = WORKER_LOADING.test(message) || WORKER_LOADING.test(String((error as { cause?: unknown })?.cause ?? ''));
      if (!waiting || Date.now() - startedAt > GIVE_UP_AFTER_MS) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_EVERY_MS));
    }
  }
}
