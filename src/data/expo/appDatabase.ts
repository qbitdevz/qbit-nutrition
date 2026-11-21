import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import { initializeDatabase, type AppDatabase } from '../database';

export const APP_DATABASE_NAME = 'app.db';

/**
 * Opens `app.db` with `expo-sqlite`, turns foreign keys on and runs the migrations before
 * returning (docs/08 sections 2 and 8). Call it once at startup, before any screen reads data.
 *
 * Rejects with a `DataError` (`migration_failed` | `foreign_keys_unavailable`) when the database
 * cannot be brought up; the previous database is untouched, and the app should show the
 * recovery screen offering export.
 */
export async function openAppDatabase(): Promise<AppDatabase> {
  const db = drizzle(openDatabaseSync(APP_DATABASE_NAME));
  await initializeDatabase(db);
  return db;
}
