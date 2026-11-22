import type { FoodRef } from './types';

export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

/**
 * Read access to `catalog.db`. The app implements it over expo-sqlite, Node tooling and
 * tests over `node:sqlite` (see scripts/catalog/nodeSqlitePort.ts). The SQLite build must
 * include FTS5. `?` placeholders only.
 */
export interface CatalogDb {
  all(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
}

/**
 * The user's learned corrections (`match_memory` in app.db), keyed by the detected name
 * normalized with `normalizeName`.
 */
export interface MatchMemory {
  get(normalizedName: string): Promise<FoodRef | null>;
  remember(normalizedName: string, ref: FoodRef): Promise<void>;
}
