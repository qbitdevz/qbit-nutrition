import Constants from 'expo-constants';

import type { FetchLike } from '@/core/ai/types';
import { createCatalog, type Catalog, type CatalogDb, type FoodRef } from '@/core/catalog';
import { createRepositories } from '@/data';
import { openAppDatabase } from '@/data/expo/appDatabase';
import { openCatalogDatabase } from '@/data/expo/catalogDatabase';
import { deviceFetch } from '@/platform/deviceFetch';
import { createExpoHealthPlatform } from '@/platform/expoHealthPlatform';
import { createExpoSecretStore } from '@/platform/expoSecretStore';
import type { HealthPlatform } from '@/platform/healthPlatform';
import type { SecretStore } from '@/platform/secretStore';
import { createBarcodeClient } from '../barcode/barcodeClient';
import { createBarcodeService } from '../barcode/barcodeService';
import { barcodeUserAgent } from '../barcode/userAgent';
import { withImportedMatching } from '../foodimport/importedMatch';
import { createHealthSync } from '../health/healthSync';
import { withHealthSync } from '../health/syncedRepos';
import { createAiServices } from './aiServices';
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
export async function openServicesOnce(
  wrapCatalogDb: (db: CatalogDb) => CatalogDb = (db) => db,
  /** Development preview only: replaces secure storage and the network. Never given on a device. */
  aiOverride?: { secrets: SecretStore; fetch: FetchLike; barcodeFetch?: FetchLike; health?: HealthPlatform; afterOpen?: (services: AppServices) => Promise<void> },
): Promise<AppServices> {
  const db = await openAppDatabase();

  let catalog: Catalog | null = null;
  const forwarding: Pick<Catalog, 'getFood'> = {
    getFood: (ref: FoodRef) => {
      if (!catalog) throw new Error('The catalog is not open yet.');
      return catalog.getFood(ref);
    },
  };
  const baseRepos = createRepositories({ db, catalog: forwarding });
  // Health Connect is told about every meal change by the repositories themselves, so no save path can forget it (S7).
  const health = createHealthSync({ repos: baseRepos, platform: aiOverride?.health ?? createExpoHealthPlatform() });
  const repos = withHealthSync(baseRepos, health);

  const catalogDb = await openCatalogDatabase(repos.settings);
  // The AI scan matcher also considers the tables the person imported (never ahead of an equal catalog match).
  catalog = withImportedMatching(createCatalog({ db: wrapCatalogDb(catalogDb), memory: repos.matchMemory }), repos.importedFoods);
  const ai = createAiServices({ repos, secrets: aiOverride?.secrets ?? createExpoSecretStore(), fetch: aiOverride?.fetch ?? deviceFetch });
  // The second (and last) legitimate destination: Open Food Facts, through its own client over the same redirect-safe wrapper.
  const barcode = createBarcodeService({
    repos,
    client: createBarcodeClient({ fetch: aiOverride?.barcodeFetch ?? deviceFetch, userAgent: barcodeUserAgent(Constants.expoConfig?.version) }),
  });
  const services: AppServices = { repos, catalog, ...ai, barcode, health };
  await aiOverride?.afterOpen?.(services);
  return services;
}
