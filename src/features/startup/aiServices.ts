import type { FetchLike } from '@/core/ai/types';
import type { Repositories } from '@/data';
import type { SecretStore } from '@/platform/secretStore';
import { createScanGateway, type ScanGateway } from '../scan/scanGateway';
import { createAiClient } from '../settings/aiClient';
import { createProviderService, type ProviderService } from '../settings/providerService';

export interface AiServices {
  providers: ProviderService;
  scan: ScanGateway;
}

/** The provider profiles service and the scan gateway over the same secret store and the same (redirect-safe) client. */
export function createAiServices(options: {
  repos: Pick<Repositories, 'aiProviders' | 'settings'>;
  secrets: SecretStore;
  fetch: FetchLike;
  retryDelayMs?: number;
}): AiServices {
  const client = createAiClient({ fetch: options.fetch, retryDelayMs: options.retryDelayMs });
  const deps = { aiProviders: options.repos.aiProviders, settings: options.repos.settings, secrets: options.secrets, client };
  return { providers: createProviderService(deps), scan: createScanGateway(deps) };
}
