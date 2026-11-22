import type { CatalogDb, SqlRow, SqlValue } from '../../core/catalog';

/**
 * The one query method the catalog port needs from a SQLite handle. `expo-sqlite`'s
 * `SQLiteDatabase` provides it in the app (see `createExpoCatalogDb`); tests wrap `node:sqlite`.
 */
export interface CatalogSqlClient {
  getAllAsync(sql: string, params: SqlValue[]): Promise<SqlRow[]>;
}

/** Implementation of core's `CatalogDb` port over a read-only `catalog.db` handle. */
export function createSqliteCatalogDb(client: CatalogSqlClient): CatalogDb {
  return {
    all: (sql, params = []) => client.getAllAsync(sql, [...params]),
  };
}
