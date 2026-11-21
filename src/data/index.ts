/**
 * Local data layer: Drizzle schema, migrations and repositories for `app.db`, and the
 * `CatalogDb` port for `catalog.db` (docs/08, docs/09 section 1.5).
 *
 * Platform-neutral entry point. The Expo wiring (opening the databases) is in `./expo/*` and is
 * imported by the app's startup only; `src/core` must never import from `src/data`.
 */
export { initializeDatabase, bundledMigrations } from './database';
export type { AppDatabase, MigrationBundle } from './database';
export { DataError, isDataError } from './errors';
export type { DataErrorCode } from './errors';
export { deriveMealTime, addDays, isLocalDate, deviceTimeZone } from './localDate';
export type { MealTime } from './localDate';
export { createSqliteCatalogDb } from './catalog/sqliteCatalogDb';
export type { CatalogSqlClient } from './catalog/sqliteCatalogDb';
export * from './repositories';
export * as schema from './schema';
