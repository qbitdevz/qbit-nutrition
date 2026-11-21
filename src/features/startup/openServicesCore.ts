import { createCatalog, type Catalog, type FoodRef } from '@/core/catalog';
import { createRepositories } from '@/data';
import { openAppDatabase } from '@/data/expo/appDatabase';
import { openCatalogDatabase } from '@/data/expo/catalogDatabase';
import type { AppServices } from './types';

/**
 * The real startup sequence on a device (docs/08 section 8): open `app.db` and run the migrations
 * (rejects with a `DataError` when they fail, leaving the previous database untouched), build the
 * repositories, then install and open `catalog.db` and wire it to the catalog.
 *
 * The repositories need the catalog (they re-read a food when its grams change) and installing the
 * catalog needs the settings repository (it records which catalog build is installed), so the
 * repositories get a small forwarding catalog that is filled in one step later.
 */
export async function openServicesOnce(): Promise<AppServices> {
  const db = await openAppDatabase();

  let catalog: Catalog | null = null;
  const forwarding: Pick<Catalog, 'getFood'> = {
    getFood: (ref: FoodRef) => {
      if (!catalog) throw new Error('The catalog is not open yet.');
      return catalog.getFood(ref);
    },
  };
  const repos = createRepositories({ db, catalog: forwarding });

  const catalogDb = await openCatalogDatabase(repos.settings);
  catalog = createCatalog({ db: catalogDb, memory: repos.matchMemory });
  return { repos, catalog };
}
