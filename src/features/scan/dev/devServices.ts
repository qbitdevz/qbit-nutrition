import type { Repositories } from '@/data';
import { createMemorySecretStore } from '@/platform/memorySecretStore';
import type { SecretStore } from '@/platform/secretStore';
import { DEV_PLACEHOLDER_KEY, DEV_PROVIDER_URL, devFetch } from './devProvider';

/**
 * DEVELOPMENT ONLY (QN_DEV_ONLY_SERVICES). What the browser preview uses instead of secure storage and
 * the network: an in-memory secret store, the fake provider, and a provider profile created on demand.
 */
export function devAiOptions() {
  return { secrets: createMemorySecretStore(), fetch: devFetch };
}

export async function seedDevProvider(repos: Pick<Repositories, 'aiProviders'>, secrets: SecretStore): Promise<void> {
  const existing = (await repos.aiProviders.list())[0];
  const provider =
    existing ??
    (await repos.aiProviders.create({ label: 'Dev fake provider', preset: null, adapter: 'openai_compatible', baseUrl: DEV_PROVIDER_URL, model: 'dev-fake-model', timeoutS: 120 }));
  // The memory store is empty after every reload, while the profile row survives in the browser's database.
  if (!(await secrets.has(provider.id))) await secrets.set(provider.id, DEV_PLACEHOLDER_KEY);
}
