import type { Catalog } from '@/core/catalog';
import type { Repositories } from '@/data';
import type { ScanGateway } from '../scan/scanGateway';
import type { ProviderService } from '../settings/providerService';

/** What screens get from startup: repositories over the migrated `app.db`, and the read-only catalog. */
export interface AppServices {
  repos: Repositories;
  catalog: Catalog;
  /** AI provider profiles: keys live in secure storage and never reach screens (docs/06 section 6). */
  providers: ProviderService;
  /** What the scan flow calls: analysis with the active profile, and the one-time notice. */
  scan: ScanGateway;
}

export type OpenServices = () => Promise<AppServices>;
