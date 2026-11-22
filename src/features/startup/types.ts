import type { Catalog } from '@/core/catalog';
import type { Repositories } from '@/data';

/** What screens get from startup: repositories over the migrated `app.db`, and the read-only catalog. */
export interface AppServices {
  repos: Repositories;
  catalog: Catalog;
}

export type OpenServices = () => Promise<AppServices>;
