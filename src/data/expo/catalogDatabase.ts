import { Asset } from 'expo-asset';
import { importDatabaseFromAssetAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { CatalogDb } from '../../core/catalog';
import { createSqliteCatalogDb } from '../catalog/sqliteCatalogDb';
import type { SettingsRepository } from '../repositories';
import { catalogAssetModule } from './catalogAsset';

export const CATALOG_DATABASE_NAME = 'catalog.db';
/** `setting` key that remembers which bundled catalog is installed in the database directory. */
export const CATALOG_MARKER_KEY = 'catalog_asset_hash';

/** core's `CatalogDb` port over an open `expo-sqlite` handle. */
export function createExpoCatalogDb(client: SQLiteDatabase): CatalogDb {
  return createSqliteCatalogDb({
    getAllAsync: (sql, params) => client.getAllAsync<Record<string, string | number | null>>(sql, params),
  });
}

/**
 * Installs the bundled catalog and opens it read-only as a separate connection.
 *
 * `catalog.db` ships inside the app as an asset and is replaced whenever the app ships a
 * different one (docs/08 section 1). The copy into the SQLite directory uses the same
 * `importDatabaseFromAssetAsync` that `<SQLiteProvider assetSource>` uses; it overwrites only
 * when the asset's content hash differs from the one recorded in `settings`, so a normal launch
 * does not copy 6 MB again. Without a hash (development) it overwrites every launch.
 */
export async function openCatalogDatabase(settings: SettingsRepository): Promise<CatalogDb> {
  const hash = Asset.fromModule(catalogAssetModule).hash;
  const installed = await settings.get(CATALOG_MARKER_KEY);
  const forceOverwrite = hash === null || installed !== hash;

  await importDatabaseFromAssetAsync(CATALOG_DATABASE_NAME, { assetId: catalogAssetModule, forceOverwrite });
  if (hash !== null && installed !== hash) await settings.set(CATALOG_MARKER_KEY, hash);

  const client = await openDatabaseAsync(CATALOG_DATABASE_NAME);
  // Nothing in the app writes to the catalog; make SQLite refuse it too.
  await client.execAsync('PRAGMA query_only = ON');
  return createExpoCatalogDb(client);
}
