/// <reference types="node" />
/** Test-only: a full dump of an app database, to compare "before" and "after" byte for byte. Never import this from app code. */
import { sql } from 'drizzle-orm';
import type { Harness } from '@/data/testing/harness';

/** The user-data tables: everything except SQLite internals and the migration bookkeeping (which must survive a wipe). */
export function userTables(harness: Pick<Harness, 'db'>): string[] {
  return harness.db
    .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name`)
    .map((t) => t.name);
}

/** Every row of every table, in a fixed order. */
export function dumpAll(harness: Pick<Harness, 'db'>): Record<string, unknown[]> {
  const tables = harness.db
    .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .map((t) => t.name);
  return Object.fromEntries(tables.map((name) => [name, harness.db.all(sql.raw(`SELECT * FROM "${name}" ORDER BY rowid`))]));
}
