import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { DataError } from './errors';
import bundledMigrations from './migrations/migrations';

/**
 * The Drizzle database every repository runs on. Both drivers the project uses return this
 * shape: `drizzle-orm/expo-sqlite` in the app and `drizzle-orm/node-sqlite` in tests. They are
 * synchronous drivers, so a transaction callback must be synchronous (use `.run()` / `.all()` / `.get()`
 * inside it) and all awaiting happens outside it.
 */
export type AppDatabase = SQLiteAsyncDatabase<'sync', any>;

type Callback<T> = Parameters<AppDatabase['transaction']>[0] extends (tx: infer Tx) => unknown
  ? (tx: Tx) => T
  : never;
/** The handle a transaction callback receives. */
export type AppTransaction = Callback<void> extends (tx: infer Tx) => void ? Tx : never;

export interface MigrationBundle {
  /** SQL text per migration, keyed by `<timestamp>_<name>`. */
  migrations: Record<string, string>;
}

export { bundledMigrations };

/**
 * Startup sequence (docs/08 sections 2 and 8), to run before anything reads data:
 * 1. `PRAGMA foreign_keys = ON` (a no-op inside a transaction, so it comes first) and verify it.
 * 2. Apply the pending migrations. Drizzle applies all pending ones inside a single transaction,
 *    so a failure rolls them all back and the previous database stays as it was.
 *
 * Throws `DataError` (`foreign_keys_unavailable` | `migration_failed`). Calling it again on an
 * up-to-date database changes nothing.
 */
export async function initializeDatabase(
  db: AppDatabase,
  migrations: MigrationBundle = bundledMigrations,
): Promise<void> {
  try {
    db.run(sql`PRAGMA foreign_keys = ON`);
    const rows = db.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
    if (rows[0]?.foreign_keys !== 1) {
      throw new DataError('foreign_keys_unavailable', 'SQLite could not enable foreign key enforcement.');
    }
  } catch (error) {
    if (error instanceof DataError) throw error;
    throw new DataError('foreign_keys_unavailable', 'SQLite could not enable foreign key enforcement.', {
      cause: error,
    });
  }

  try {
    // The migrator only touches `db.session`, which both drivers share.
    await migrate(db as unknown as ExpoSQLiteDatabase, { migrations: migrations.migrations });
  } catch (error) {
    throw new DataError(
      'migration_failed',
      `Database migration failed; the previous database was left unchanged. ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}
